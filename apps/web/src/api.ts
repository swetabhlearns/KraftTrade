import type { Candle, ConditionalOrderInput, LeaderboardEntry, MarketOrderInput, OrderView, PortfolioView, ProfileInput, TradeView, UserProfile } from "@kraftbase/shared";
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await res.json(); if (!res.ok) throw new Error(body.error || "Request failed"); return body;
}
export const loadPortfolio = async (token: string): Promise<PortfolioView> => {
  const [wallet, holdingResult] = await Promise.all([api<PortfolioView["wallet"]>("/api/v1/wallet", token), api<{ holdings: PortfolioView["holdings"] }>("/api/v1/holdings", token)]);
  return { wallet, holdings: holdingResult.holdings };
};
export const loadTrades = (token: string) => api<{ trades: TradeView[]; nextCursor: string | null }>("/api/v1/trades?limit=25", token);
export const loadCandles = (symbol: string) => api<{ candles: Candle[] }>(`/api/v1/markets/${symbol}/candles?limit=120`);
export const placeOrder = (token: string, input: MarketOrderInput) => api<{ trade: TradeView; portfolio: PortfolioView }>("/api/v1/orders/market", token, { method: "POST", body: JSON.stringify(input) });
export const placeConditionalOrder = (token: string, input: ConditionalOrderInput) => api<{ order: OrderView }>("/api/v1/orders/conditional", token, { method: "POST", body: JSON.stringify(input) });
export const loadOrders = (token: string) => api<{ orders: OrderView[] }>("/api/v1/orders?limit=50", token);
export const cancelPendingOrder = (token: string, id: string) => api<{ order: OrderView }>(`/api/v1/orders/${id}`, token, { method: "DELETE" });
export const loadLeaderboard = (token: string) => api<{ entries: LeaderboardEntry[] }>("/api/v1/leaderboard", token);
export const loadMe = (token: string) => api<{ user: UserProfile }>("/api/v1/me", token);
export const saveProfile = (token: string, input: ProfileInput) => api<{ user: UserProfile }>("/api/v1/me/profile", token, { method: "POST", body: JSON.stringify(input) });
