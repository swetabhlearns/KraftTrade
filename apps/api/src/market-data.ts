import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { MARKETS, type Candle, type Depth, type MarketSymbol, type Ticker } from "@kraftbase/shared";

const BINANCE_WS = "wss://stream.binance.com:9443/ws";
export class MarketData extends EventEmitter {
  private ws?: WebSocket; private requestId = 0; private reconnects = 0; private stopped = false;
  private recycle?: NodeJS.Timeout; private reconnectTimer?: NodeJS.Timeout;
  private refs = new Map<MarketSymbol, number>();
  private quotes = new Map<MarketSymbol, { price: string; updatedAt: number }>();

  start() { this.stopped = false; this.connect(); }
  stop() { this.stopped = true; clearTimeout(this.recycle); clearTimeout(this.reconnectTimer); this.ws?.close(); }
  getQuote(symbol: MarketSymbol) { return this.quotes.get(symbol); }
  private streams(symbol: MarketSymbol) { const s = symbol.toLowerCase(); return [`${s}@ticker`, `${s}@depth20@100ms`, `${s}@kline_1m`]; }
  subscribe(symbol: MarketSymbol) {
    const count = this.refs.get(symbol) ?? 0; this.refs.set(symbol, count + 1);
    if (count === 0) this.send("SUBSCRIBE", this.streams(symbol));
  }
  unsubscribe(symbol: MarketSymbol) {
    const next = Math.max(0, (this.refs.get(symbol) ?? 0) - 1);
    if (next === 0) { this.refs.delete(symbol); this.send("UNSUBSCRIBE", this.streams(symbol)); } else this.refs.set(symbol, next);
  }
  private connect() {
    if (this.stopped) return;
    this.ws = new WebSocket(BINANCE_WS);
    this.ws.on("open", () => {
      this.reconnects = 0; this.emit("status", { connected: true, message: "Live market connected" });
      this.ws?.send(JSON.stringify({ method: "SET_PROPERTY", params: ["combined", true], id: ++this.requestId }));
      const streams = [...this.refs.keys()].flatMap(s => this.streams(s)); if (streams.length) this.send("SUBSCRIBE", streams);
      clearTimeout(this.recycle); this.recycle = setTimeout(() => this.ws?.close(1000, "Scheduled refresh"), 23 * 60 * 60 * 1000);
    });
    this.ws.on("message", raw => this.parse(raw.toString()));
    this.ws.on("error", () => this.emit("status", { connected: false, message: "Market connection interrupted" }));
    this.ws.on("close", () => { if (!this.stopped) this.scheduleReconnect(); });
    this.ws.on("ping", data => this.ws?.pong(data));
  }
  private scheduleReconnect() {
    this.emit("status", { connected: false, message: "Reconnecting to market" });
    const delay = Math.min(30000, 1000 * 2 ** this.reconnects++) + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
  private send(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method, params, id: ++this.requestId }));
  }
  private parse(raw: string) {
    try {
      const frame = JSON.parse(raw); const d = frame.data ?? frame; if (!d?.e && !d?.lastUpdateId) return;
      const streamSymbol = typeof frame.stream === "string" ? frame.stream.split("@")[0]?.toUpperCase() : undefined;
      const symbol = (d.s ?? streamSymbol) as MarketSymbol; if (!MARKETS.includes(symbol)) return;
      if (d.e === "24hrTicker") {
        const ticker: Ticker = { symbol, price: d.c, changePercent: d.P, high: d.h, low: d.l, volume: d.q, updatedAt: Date.now() };
        this.quotes.set(symbol, { price: d.c, updatedAt: ticker.updatedAt }); this.emit("ticker", ticker);
      } else if (d.e === "kline") {
        const k = d.k; const candle: Candle = { symbol, time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, closed: k.x }; this.emit("candle", candle);
      } else if (d.lastUpdateId) {
        const depth: Depth = { symbol, bids: d.bids, asks: d.asks, updatedAt: Date.now() }; this.emit("depth", depth);
      }
    } catch { /* Ignore malformed upstream frames. */ }
  }
}
export const marketData = new MarketData();

export async function getCandles(symbol: MarketSymbol, interval = "1m", limit = 120): Promise<Candle[]> {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com"];
  for (const host of hosts) {
    const url = new URL("/api/v3/klines", host);
    url.searchParams.set("symbol", symbol); url.searchParams.set("interval", interval); url.searchParams.set("limit", String(limit));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) continue;
      const rows = await response.json() as unknown[][];
      return rows.map(r => ({ symbol, time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), closed: true }));
    } catch { /* Try the next Binance public market-data host. */ }
  }
  throw new Error("Binance candle request failed");
}
