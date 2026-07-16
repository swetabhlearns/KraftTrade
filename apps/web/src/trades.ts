import type { TradeView } from "@kraftbase/shared";

/** Keeps the newest copy of each immutable trade, regardless of delivery path. */
export function mergeTrade(current: TradeView[], incoming: TradeView): TradeView[] {
  return [incoming, ...current.filter(trade => trade.id !== incoming.id)].slice(0, 25);
}

export function uniqueTrades(trades: TradeView[]): TradeView[] {
  const seen = new Set<string>();
  return trades.filter(trade => !seen.has(trade.id) && Boolean(seen.add(trade.id)));
}
