import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Candle, Depth, OrderView, PortfolioView, MarketSymbol, SocketClientEvents, SocketServerEvents, Ticker, TradeView } from "@kraftbase/shared";
import { API_URL } from "./api";

export function useMarket(token: string | undefined, selected: MarketSymbol) {
  const socket = useRef<Socket<SocketServerEvents, SocketClientEvents> | undefined>(undefined);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [tickers, setTickers] = useState<Partial<Record<MarketSymbol, Ticker>>>({}); const [depth, setDepth] = useState<Depth>();
  const [liveCandle, setLiveCandle] = useState<Candle>(); const [connected, setConnected] = useState(false);
  const [orderEvent, setOrderEvent] = useState<{ order: OrderView; message: string }>(); const [executionEvent, setExecutionEvent] = useState<{ trade: TradeView; portfolio: PortfolioView }>();
  useEffect(() => {
    if (!token) return; const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'] as MarketSymbol[];
    const s = io(API_URL, { auth: { token }, transports: ["websocket", "polling"] }); socket.current = s;
    s.on("connect", () => { setConnected(true); symbols.forEach(symbol => s.emit("market:subscribe", { symbol })); }); s.on("disconnect", () => setConnected(false));
    s.on("market:status", value => setConnected(value.connected)); s.on("market:ticker", value => setTickers(old => ({ ...old, [value.symbol]: value })));
    s.on("market:depth", value => { if (value.symbol === selectedRef.current) setDepth(value); }); s.on("market:candle", value => { if (value.symbol === selectedRef.current) setLiveCandle(value); });
    s.on("order:updated", setOrderEvent); s.on("order:executed", setExecutionEvent);
    return () => { symbols.forEach(symbol => s.emit("market:unsubscribe", { symbol })); s.disconnect(); };
  }, [token]);
  useEffect(() => { setDepth(undefined); setLiveCandle(undefined); }, [selected]);
  return { tickers, depth, liveCandle, connected, orderEvent, executionEvent };
}
