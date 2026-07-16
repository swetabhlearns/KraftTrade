import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { Candle } from "@kraftbase/shared";

export function Chart({ candles }: { candles: Candle[] }) {
  const [range, setRange] = useState(120); const [hover, setHover] = useState<number>(); const ref = useRef<SVGSVGElement>(null);
  const visible = candles.slice(-range);
  const model = useMemo(() => {
    if (!visible.length) return { path: "", area: "", min: 0, max: 0, points: [] as {x:number;y:number}[] };
    const values = visible.map(c => c.close), min = Math.min(...visible.map(c => c.low)), max = Math.max(...visible.map(c => c.high)), span = max - min || 1;
    const points = values.map((v, i) => ({ x: (i / Math.max(1, values.length - 1)) * 800, y: 230 - ((v - min) / span) * 190 })); const coords = points.map(p => `${p.x},${p.y}`);
    return { path: `M${coords.join(" L")}`, area: `M${coords[0]} L${coords.slice(1).join(" L")} L800,250 L0,250 Z`, min, max, points };
  }, [visible]);
  function move(event: MouseEvent<SVGSVGElement>) { const box = ref.current!.getBoundingClientRect(), x = (event.clientX - box.left) / box.width; setHover(Math.max(0, Math.min(visible.length - 1, Math.round(x * (visible.length - 1))))); }
  const active = hover === undefined ? undefined : visible[hover], point = hover === undefined ? undefined : model.points[hover];
  return <><div className="chart-toolbar">{[[30,"30M"],[60,"1H"],[120,"2H"]] .map(([value,label]) => <button key={value} className={range===value?"active":""} onClick={() => setRange(value as number)}>{label}</button>)}</div><div className="chart" aria-label="Interactive one minute price chart"><div className="chart-scale"><span>{model.max.toLocaleString(undefined,{maximumFractionDigits:2})}</span><span>{model.min.toLocaleString(undefined,{maximumFractionDigits:2})}</span></div><svg ref={ref} viewBox="0 0 800 250" preserveAspectRatio="none" role="img" onMouseMove={move} onMouseLeave={() => setHover(undefined)}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c6ff4a" stopOpacity=".2"/><stop offset="1" stopColor="#c6ff4a" stopOpacity="0"/></linearGradient></defs><path d={model.area} fill="url(#chartFill)"/><path d={model.path} fill="none" stroke="#c6ff4a" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{point && <><line x1={point.x} x2={point.x} y1="0" y2="250" stroke="#8f9587" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/><circle cx={point.x} cy={point.y} r="5" fill="#c6ff4a" vectorEffect="non-scaling-stroke"/></>}</svg>{active && point && <div className="chart-tooltip" style={{left:`${Math.min(82,Math.max(5,(point.x/800)*100))}%`}}><b>${active.close.toLocaleString()}</b><span>{new Date(active.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span><small>H {active.high.toLocaleString()} · L {active.low.toLocaleString()}</small></div>}{!candles.length && <div className="chart-empty">Waiting for market data…</div>}</div></>;
}
