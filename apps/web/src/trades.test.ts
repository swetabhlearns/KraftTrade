import { describe, expect, it } from "vitest";
import type { TradeView } from "@kraftbase/shared";
import { mergeTrade, uniqueTrades } from "./trades";

const trade = { id: "trade-1", symbol: "BTCUSDT", side: "BUY", quantity: "0.1", price: "100", quoteAmount: "10", executedAt: new Date().toISOString() } satisfies TradeView;

describe("trade event merging", () => {
  it("does not duplicate the same trade delivered by HTTP and WebSocket", () => expect(mergeTrade(mergeTrade([], trade), trade)).toEqual([trade]));
  it("deduplicates a loaded history defensively", () => expect(uniqueTrades([trade, trade])).toEqual([trade]));
});
