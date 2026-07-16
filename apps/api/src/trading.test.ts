import { describe, expect, it } from "vitest";
import { conditionalOrderSchema, marketOrderSchema, profileSchema } from "@kraftbase/shared";

describe("market order validation", () => {
  it("accepts a valid market order", () => expect(marketOrderSchema.safeParse({ symbol: "BTCUSDT", side: "BUY", quantity: "0.01", clientOrderId: crypto.randomUUID() }).success).toBe(true));
  it("rejects unsupported symbols and excess precision", () => {
    expect(marketOrderSchema.safeParse({ symbol: "SCAMUSDT", side: "BUY", quantity: "1", clientOrderId: crypto.randomUUID() }).success).toBe(false);
    expect(marketOrderSchema.safeParse({ symbol: "BTCUSDT", side: "BUY", quantity: "0.000000001", clientOrderId: crypto.randomUUID() }).success).toBe(false);
  });
  it("accepts limits and only permits sell stop-loss orders", () => {
    const base = { symbol: "ETHUSDT", quantity: "1", triggerPrice: "2000", clientOrderId: crypto.randomUUID() };
    expect(conditionalOrderSchema.safeParse({ ...base, type: "LIMIT", side: "BUY" }).success).toBe(true);
    expect(conditionalOrderSchema.safeParse({ ...base, type: "STOP_LOSS", side: "SELL" }).success).toBe(true);
    expect(conditionalOrderSchema.safeParse({ ...base, type: "STOP_LOSS", side: "BUY" }).success).toBe(false);
  });
  it("validates onboarding names", () => {
    expect(profileSchema.safeParse({ name: "Aarav Sharma" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: " " }).success).toBe(false);
  });
});
