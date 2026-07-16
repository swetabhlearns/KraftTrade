import { Prisma, type Order, type OrderSide, type Trade } from "@prisma/client";
import { Decimal } from "decimal.js";
import type { ConditionalOrderInput, LeaderboardEntry, MarketOrderInput, MarketSymbol, OrderView, PortfolioView, TradeView } from "@kraftbase/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { marketData } from "./market-data.js";

const STALE_MS = 5000; const MIN_NOTIONAL = new Decimal(1);
const assetOf = (symbol: string) => symbol.replace("USDT", "");
const decimal = (value: Prisma.Decimal | Decimal | string | number) => new Decimal(value.toString());
const s = (value: Prisma.Decimal | Decimal) => decimal(value).toFixed(8).replace(/\.?0+$/, "");

export async function portfolio(userId: string): Promise<PortfolioView> {
  const [wallet, holdings] = await Promise.all([prisma.wallet.findUniqueOrThrow({ where: { userId } }), prisma.holding.findMany({ where: { userId, quantity: { gt: 0 } }, orderBy: { asset: "asc" } })]);
  return { wallet: { cashBalance: s(wallet.cashBalance), currency: "USDT", updatedAt: wallet.updatedAt.toISOString() }, holdings: holdings.map(h => ({ asset: h.asset, quantity: s(h.quantity), averageCost: s(h.averageCost) })) };
}

export async function executeMarketOrder(userId: string, input: MarketOrderInput) {
  const existing = await prisma.order.findUnique({ where: { userId_clientOrderId: { userId, clientOrderId: input.clientOrderId } }, include: { trade: true } });
  if (existing) return { duplicate: true, trade: existing.trade ? toTrade(existing.trade) : null, portfolio: await portfolio(userId) };
  const price = freshPrice(input.symbol); const trade = await fill(userId, input, price);
  return { duplicate: false, trade: toTrade(trade), portfolio: await portfolio(userId) };
}

export async function createConditionalOrder(userId: string, input: ConditionalOrderInput) {
  const existing = await prisma.order.findUnique({ where: { userId_clientOrderId: { userId, clientOrderId: input.clientOrderId } } });
  if (existing) return { duplicate: true, order: toOrder(existing) };
  const quantity = decimal(input.quantity), trigger = decimal(input.triggerPrice);
  if (quantity.mul(trigger).lt(MIN_NOTIONAL)) throw bad("Minimum order value is 1 USDT");
  const asset = assetOf(input.symbol); const [wallet, holding] = await Promise.all([prisma.wallet.findUniqueOrThrow({ where: { userId } }), prisma.holding.findUnique({ where: { userId_asset: { userId, asset } } })]);
  if (input.side === "BUY" && decimal(wallet.cashBalance).lt(quantity.mul(trigger))) throw bad("Insufficient USDT balance for this limit order");
  if (input.side === "SELL" && (!holding || decimal(holding.quantity).lt(quantity))) throw bad(`Insufficient ${asset} balance`);
  const order = await prisma.order.create({ data: { userId, clientOrderId: input.clientOrderId, symbol: input.symbol, side: input.side, type: input.type, quantity: input.quantity, triggerPrice: input.triggerPrice, status: "PENDING" } });
  return { duplicate: false, order: toOrder(order) };
}

export async function cancelOrder(userId: string, orderId: string) {
  const result = await prisma.order.updateMany({ where: { id: orderId, userId, status: "PENDING" }, data: { status: "CANCELED" } });
  if (!result.count) throw Object.assign(new Error("Pending order not found"), { status: 404 });
  return toOrder(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }));
}

export async function processTriggeredOrders(symbol: MarketSymbol, priceText: string) {
  const price = decimal(priceText); const pending = await prisma.order.findMany({ where: { symbol, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 });
  const results: { userId: string; order: OrderView; trade?: TradeView; portfolio?: PortfolioView }[] = [];
  for (const order of pending) {
    const trigger = decimal(order.triggerPrice!); const shouldFill = order.type === "STOP_LOSS" ? price.lte(trigger) : order.side === "BUY" ? price.lte(trigger) : price.gte(trigger);
    if (!shouldFill) continue;
    try {
      const trade = await fill(order.userId, { symbol: symbol, side: order.side, quantity: s(order.quantity), clientOrderId: order.clientOrderId }, price, order);
      results.push({ userId: order.userId, order: toOrder(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })), trade: toTrade(trade), portfolio: await portfolio(order.userId) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Execution failed";
      const rejected = await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "REJECTED", rejectionReason: reason } });
      if (rejected.count) results.push({ userId: order.userId, order: toOrder(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })) });
    }
  }
  return results;
}

async function fill(userId: string, input: MarketOrderInput, price: Decimal, pending?: Order) {
  const quantity = decimal(input.quantity), total = quantity.mul(price); if (total.lt(MIN_NOTIONAL)) throw bad("Minimum order value is 1 USDT");
  return withRetry(() => prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } }); const asset = assetOf(input.symbol);
    const holding = await tx.holding.findUnique({ where: { userId_asset: { userId, asset } } });
    if (input.side === "BUY" && decimal(wallet.cashBalance).lt(total)) throw bad("Insufficient USDT balance at execution time");
    if (input.side === "SELL" && (!holding || decimal(holding.quantity).lt(quantity))) throw bad(`Insufficient ${asset} balance at execution time`);
    let order: Order;
    if (pending) {
      const claimed = await tx.order.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "EXECUTED", executionPrice: price.toString(), quoteAmount: total.toString(), executedAt: new Date() } });
      if (!claimed.count) throw Object.assign(new Error("Order was already processed"), { status: 409 });
      order = await tx.order.findUniqueOrThrow({ where: { id: pending.id } });
    } else order = await tx.order.create({ data: { userId, clientOrderId: input.clientOrderId, symbol: input.symbol, side: input.side as OrderSide, type: "MARKET", quantity: input.quantity, executionPrice: price.toString(), quoteAmount: total.toString(), status: "EXECUTED", executedAt: new Date() } });
    await tx.wallet.update({ where: { userId }, data: { cashBalance: input.side === "BUY" ? { decrement: total.toString() } : { increment: total.toString() }, version: { increment: 1 } } });
    if (input.side === "BUY") {
      const oldQty = decimal(holding?.quantity ?? 0), newQty = oldQty.plus(quantity); const averageCost = oldQty.mul(decimal(holding?.averageCost ?? 0)).plus(total).div(newQty);
      await tx.holding.upsert({ where: { userId_asset: { userId, asset } }, create: { userId, asset, quantity: newQty.toString(), averageCost: averageCost.toString() }, update: { quantity: newQty.toString(), averageCost: averageCost.toString() } });
    } else {
      const remaining = decimal(holding!.quantity).minus(quantity); await tx.holding.update({ where: { userId_asset: { userId, asset } }, data: { quantity: remaining.toString(), averageCost: remaining.isZero() ? 0 : holding!.averageCost } });
    }
    return tx.trade.create({ data: { orderId: order.id, userId, symbol: input.symbol, side: input.side as OrderSide, quantity: quantity.toString(), price: price.toString(), quoteAmount: total.toString() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function leaderboard(currentUserId: string): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({ include: { wallet: true, holdings: { where: { quantity: { gt: 0 } } } } });
  return users.map(user => {
    const value = user.holdings.reduce((sum, h) => { const quote = marketData.getQuote(`${h.asset}USDT` as MarketSymbol); return sum.plus(quote ? decimal(h.quantity).mul(quote.price) : decimal(h.quantity).mul(h.averageCost)); }, decimal(user.wallet?.cashBalance ?? 0));
    return { userId: user.id, alias: user.displayName ?? `Trader ${user.id.slice(-4).toUpperCase()}`, value, returnPercent: value.minus(config.STARTING_BALANCE).div(config.STARTING_BALANCE).mul(100) };
  }).sort((a,b) => b.value.comparedTo(a.value)).slice(0, 20).map((row, index) => ({ rank: index + 1, alias: row.alias, portfolioValue: s(row.value), returnPercent: row.returnPercent.toFixed(2), isCurrentUser: row.userId === currentUserId }));
}

function freshPrice(symbol: MarketSymbol) { const quote = marketData.getQuote(symbol); if (!quote || Date.now() - quote.updatedAt > STALE_MS) throw Object.assign(new Error("Live quote is unavailable or stale"), { status: 503 }); return decimal(quote.price); }
function bad(message: string) { return Object.assign(new Error(message), { status: 400 }); }
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> { try { return await fn(); } catch (e) { if (tries > 1 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return withRetry(fn, tries - 1); throw e; } }
export function toTrade(t: Pick<Trade, "id"|"symbol"|"side"|"quantity"|"price"|"quoteAmount"|"executedAt">): TradeView { return { id: t.id, symbol: t.symbol as MarketSymbol, side: t.side, quantity: s(t.quantity), price: s(t.price), quoteAmount: s(t.quoteAmount), executedAt: t.executedAt.toISOString() }; }
export function toOrder(o: Order): OrderView { return { id: o.id, symbol: o.symbol as MarketSymbol, side: o.side, type: o.type, status: o.status, quantity: s(o.quantity), triggerPrice: o.triggerPrice ? s(o.triggerPrice) : null, executionPrice: o.executionPrice ? s(o.executionPrice) : null, createdAt: o.createdAt.toISOString(), rejectionReason: o.rejectionReason }; }
