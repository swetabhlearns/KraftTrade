import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("API client", () => {
  afterEach(() => vi.restoreAllMocks());
  it("adds the Privy bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    await api("/health", "access-token");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer access-token" });
  });
  it("surfaces API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Quote is stale" }), { status: 503, headers: { "content-type": "application/json" } }));
    await expect(api("/api/v1/orders/market")).rejects.toThrow("Quote is stale");
  });
});
