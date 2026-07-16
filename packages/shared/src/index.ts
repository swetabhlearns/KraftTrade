import { z } from "zod";

export const MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"] as const;
export type MarketSymbol = (typeof MARKETS)[number];
export const ASSET_NAMES: Record<MarketSymbol, string> = {
  BTCUSDT: "Bitcoin", ETHUSDT: "Ethereum", SOLUSDT: "Solana",
  BNBUSDT: "BNB", XRPUSDT: "XRP", DOGEUSDT: "Dogecoin"
};

export const marketOrderSchema = z.object({
  symbol: z.enum(MARKETS),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.string().regex(/^\d+(\.\d{1,8})?$/, "Use up to 8 decimal places").refine(v => Number(v) > 0, "Quantity must be positive"),
  clientOrderId: z.string().uuid()
});
export type MarketOrderInput = z.infer<typeof marketOrderSchema>;
export const conditionalOrderSchema = marketOrderSchema.extend({
  type: z.enum(["LIMIT", "STOP_LOSS"]),
  triggerPrice: z.string().regex(/^\d+(\.\d{1,8})?$/, "Use up to 8 decimal places").refine(v => Number(v) > 0, "Trigger price must be positive")
}).superRefine((value, ctx) => {
  if (value.type === "STOP_LOSS" && value.side !== "SELL") ctx.addIssue({ code: "custom", path: ["side"], message: "Stop-loss orders must sell an existing holding" });
});
export type ConditionalOrderInput = z.infer<typeof conditionalOrderSchema>;
export const profileSchema = z.object({ name: z.string().trim().min(2, "Enter at least 2 characters").max(60, "Name is too long") });
export type ProfileInput = z.infer<typeof profileSchema>;
export interface UserProfile { id: string; name: string | null; email: string | null; profileComplete: boolean }

export interface Ticker {
  symbol: MarketSymbol; price: string; changePercent: string; high: string; low: string;
  volume: string; updatedAt: number;
}
export interface Depth { symbol: MarketSymbol; bids: [string, string][]; asks: [string, string][]; updatedAt: number }
export interface Candle { symbol: MarketSymbol; time: number; open: number; high: number; low: number; close: number; volume: number; closed?: boolean }
export interface WalletView { cashBalance: string; currency: "USDT"; updatedAt: string }
export interface HoldingView { asset: string; quantity: string; averageCost: string }
export interface TradeView { id: string; symbol: MarketSymbol; side: "BUY" | "SELL"; quantity: string; price: string; quoteAmount: string; executedAt: string }
export interface OrderView { id: string; symbol: MarketSymbol; side: "BUY" | "SELL"; type: "MARKET" | "LIMIT" | "STOP_LOSS"; status: "PENDING" | "EXECUTED" | "REJECTED" | "CANCELED"; quantity: string; triggerPrice: string | null; executionPrice: string | null; createdAt: string; rejectionReason?: string | null }
export interface LeaderboardEntry { rank: number; alias: string; portfolioValue: string; returnPercent: string; isCurrentUser: boolean }
export interface PortfolioView { wallet: WalletView; holdings: HoldingView[] }
export interface SocketServerEvents {
  "market:ticker": (data: Ticker) => void; "market:depth": (data: Depth) => void;
  "market:candle": (data: Candle) => void; "market:status": (data: { connected: boolean; message: string }) => void;
  "portfolio:updated": (data: PortfolioView) => void; "order:executed": (data: { trade: TradeView; portfolio: PortfolioView }) => void;
  "order:updated": (data: { order: OrderView; message: string }) => void;
}
export interface SocketClientEvents {
  "market:subscribe": (data: { symbol: MarketSymbol }) => void;
  "market:unsubscribe": (data: { symbol: MarketSymbol }) => void;
}
