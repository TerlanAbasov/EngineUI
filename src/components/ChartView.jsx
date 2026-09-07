import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  BarChart,
} from "recharts";
import { api } from "../api/client";
import { fmt, fmtDateTime, TIMEFRAMES } from "../api/format";

const AXIS = { stroke: "#8b949e", fontSize: 11 };
const GRID = "#2a3441";
const UP = "#3fb950";
const DOWN = "#f85149";
const EXITC = "#8b949e";

// last index of a sorted ISO array that is <= target
function lastIdxLE(iso, target) {
  let lo = 0, hi = iso.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (iso[mid] <= target) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

const BuyMark = ({ cx, cy }) => cx == null ? null :
  <path d={`M ${cx},${cy + 3} L ${cx - 5},${cy + 12} L ${cx + 5},${cy + 12} Z`} fill={UP} stroke="#0b0f14" strokeWidth={0.5} />;
const SellMark = ({ cx, cy }) => cx == null ? null :
  <path d={`M ${cx},${cy - 3} L ${cx - 5},${cy - 12} L ${cx + 5},${cy - 12} Z`} fill={DOWN} stroke="#0b0f14" strokeWidth={0.5} />;
const ExitMark = ({ cx, cy }) => cx == null ? null :
  <circle cx={cx} cy={cy} r={3.2} fill="none" stroke={EXITC} strokeWidth={1.4} />;

// --- indicator helpers -----------------------------------------------------
function sma(vals, p) {
  const out = new Array(vals.length).fill(null);
  if (p < 1) return out;
  let s = 0;
  for (let i = 0; i < vals.length; i++) {
    s += vals[i];
    if (i >= p) s -= vals[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}
function ema(vals, p) {
  const out = new Array(vals.length).fill(null);
  if (p < 1 || !vals.length) return out;
  const k = 2 / (p + 1);
  let prev = vals[0];
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[0] : vals[i] * k + prev * (1 - k);
    if (i >= p - 1) out[i] = prev;
  }
  return out;
}
function linregLine(vals) {
  const n = vals.length;
  if (n < 2) return { line: vals.map(() => null), slopePctPerBar: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += vals[i]; sxx += i * i; sxy += i * vals[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  const first = a;
  return { line: vals.map((_, i) => a + b * i), slopePctPerBar: first ? (b / first) * 100 : 0 };
}

// --- candlestick shape (Recharts custom shape on a [low, high] range Bar) --
function Candle(props) {
  const { x, y, width, height, payload } = props;
  if (payload == null) return null;
  const { open, high, low, close } = payload;
  if (![open, high, low, close].every(Number.isFinite) || high <= low || width <= 0) return null;
  const px = (v) => y + (height * (high - v)) / (high - low); // pixel of a price within [low, high]
  const up = close >= open;
  const color = up ? UP : DOWN;
  const cx = x + width / 2;
  const bodyTop = px(Math.max(open, close));
  const bodyBot = px(Math.min(open, close));
  const bw = Math.max(1, width * 0.66);
  return (
    <g stroke={color} fill={color}>
      <line x1={cx} x2={cx} y1={y} y2={y + height} strokeWidth={1} />
      <rect x={cx - bw / 2} width={bw} y={bodyTop} height={Math.max(1, bodyBot - bodyTop)} />
    </g>
  );
}

function TipRow({ label, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><span className="muted">{label}</span><b>{v}</b></div>;
}
function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: "#131820", border: `1px solid ${GRID}`, padding: "6px 8px", fontSize: 12 }}>
      <div style={{ marginBottom: 4 }}>{p.date}</div>
      <TipRow label="O" v={fmt(p.open, 2)} /><TipRow label="H" v={fmt(p.high, 2)} />
      <TipRow label="L" v={fmt(p.low, 2)} /><TipRow label="C" v={fmt(p.close, 2)} />
      <TipRow label="Vol" v={Number(p.volume).toLocaleString()} />
      {p.sigTip?.length > 0 && (
        <div style={{ marginTop: 4, borderTop: `1px solid ${GRID}`, paddingTop: 4 }}>
          {p.sigTip.map((s, i) => (
            <div key={i} style={{ color: s.type === "BUY" ? UP : s.type === "SELL" ? DOWN : EXITC }}>
              {s.type} · {s.strategy} <span className="muted">@ {s.tf}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartView() {
  const [symbols, setSymbols] = useState([]);
  const [stratNames, setStratNames] = useState([]);
  const [form, setForm] = useState({
    symbol: "", timeframe: "D1", start: "", end: "", limit: 1500,
    maType: "sma", ma1: 20, ma2: 50, showMa1: true, showMa2: true,
    trend: true, volume: true, logScale: false,
    strategyNames: "", signalTf: "chart",   // chart = use the chart timeframe; auto = each strategy's default
  });
  const [series, setSeries] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sig, setSig] = useState(null);     // { symbol, strategies: [{ strategy, timeframe, markers: [...] }] }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.dataSymbols().then((rows) => {
      setSymbols(rows || []);
      if (rows?.length && !form.symbol) upd("symbol", rows[0].symbol);
    }).catch(() => {});
    api.strategies().then((rows) => setStratNames((rows || []).map((r) => r.name))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (opts = {}) => {
    const sym = form.symbol.trim().toUpperCase();
    if (!sym) { if (!opts.silent) setErr("Enter a symbol"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.priceBars({
        symbol: sym,
        timeframe: form.timeframe,
        start: form.start || undefined,
        end: form.end || undefined,
        limit: Number(form.limit) || 1500,
      });
      setSeries(r);
      setMeta({ symbol: r.symbol, timeframe: r.timeframe, bars: r.bars });
    } catch (e) { setErr(e.message); setSeries(null); } finally { setBusy(false); }
  };

  // Auto-reload whenever a data-fetching param changes (debounced so typing a
  // symbol doesn't fire a request per keystroke). Overlay toggles / MA periods
  // are applied client-side by the useMemo below, so they need no refetch.
  useEffect(() => {
    if (!form.symbol.trim()) return;
    const t = setTimeout(() => load({ silent: true }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.symbol, form.timeframe, form.start, form.end, form.limit]);

  // Fetch strategy buy/sell markers, debounced, on the same param set + strategy selection.
  useEffect(() => {
    const sym = form.symbol.trim().toUpperCase();
    if (!sym || !form.strategyNames.trim()) { setSig(null); return; }
    const t = setTimeout(() => {
      api.chartSignals({
        symbol: sym,
        strategies: form.strategyNames.trim(),
        timeframe: form.signalTf === "auto" ? "AUTO" : form.timeframe,
        limit: Number(form.limit) || 1500,
      }).then(setSig).catch(() => setSig(null));
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.symbol, form.timeframe, form.limit, form.strategyNames, form.signalTf]);

  const { data, stats, markerCount } = useMemo(() => {
    const bars = series?.data || [];
    if (!bars.length) return { data: [], stats: null, markerCount: 0 };
    const closes = bars.map((b) => b.close);
    const maFn = form.maType === "ema" ? ema : sma;
    const m1 = maFn(closes, Number(form.ma1) || 0);
    const m2 = maFn(closes, Number(form.ma2) || 0);
    const { line: trend, slopePctPerBar } = linregLine(closes);
    const data = bars.map((b, i) => ({
      ...b,
      iso: b.date,
      date: fmtDateTime(b.date),
      hl: [b.low, b.high],
      ma1: m1[i], ma2: m2[i], trend: trend[i],
      buy: null, sell: null, exit: null, sigTip: null,
    }));

    // map each strategy's markers onto the containing chart bar
    let markerCount = 0;
    const iso = data.map((d) => d.iso);
    for (const strat of sig?.strategies || []) {
      for (const mk of strat.markers || []) {
        const j = lastIdxLE(iso, mk.date);
        if (j < 0) continue;
        markerCount++;
        const d = data[j];
        if (mk.type === "BUY") d.buy = d.low;
        else if (mk.type === "SELL") d.sell = d.high;
        else d.exit = d.close;
        (d.sigTip ||= []).push({ strategy: strat.strategy, type: mk.type, tf: strat.timeframe });
      }
    }

    const first = closes[0], last = closes[closes.length - 1];
    const hi = Math.max(...bars.map((b) => b.high));
    const lo = Math.min(...bars.map((b) => b.low));
    return {
      data, markerCount,
      stats: {
        last, chg: last - first, chgPct: first ? ((last - first) / first) * 100 : 0,
        hi, lo, slopePctPerBar,
      },
    };
  }, [series, sig, form.maType, form.ma1, form.ma2]);

  const yDomain = useMemo(() => {
    if (!data.length) return ["auto", "auto"];
    const lo = Math.min(...data.map((d) => d.low));
    const hi = Math.max(...data.map((d) => d.high));
    const pad = (hi - lo) * 0.04 || hi * 0.02;
    return [Math.max(lo * 0.9, lo - pad), hi + pad];   // stays > 0 so log scale works
  }, [data]);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Chart{meta ? ` — ${meta.symbol}` : ""}</h2>
        {stats && (
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{fmt(stats.last, 2)}</span>
            <span className={stats.chg >= 0 ? "pos" : "neg"}>
              {stats.chg >= 0 ? "+" : ""}{fmt(stats.chg, 2)} ({stats.chgPct >= 0 ? "+" : ""}{fmt(stats.chgPct, 2)}%)
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {meta.bars} bars @ {(TIMEFRAMES.find((t) => t.id === meta.timeframe)?.label) || meta.timeframe}
              {" · "}H {fmt(stats.hi, 2)} · L {fmt(stats.lo, 2)}
              {" · trend "}<span className={stats.slopePctPerBar >= 0 ? "pos" : "neg"}>{fmt(stats.slopePctPerBar, 3)}%/bar</span>
              {sig && (() => {
                const shown = sig.strategies || [];
                const tfs = [...new Set(shown.map((s) => s.timeframe))].join("/");
                return <> · {markerCount} signal{markerCount === 1 ? "" : "s"} <span className="muted">({shown.length} strat @ {tfs})</span></>;
              })()}
            </span>
          </div>
        )}
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div>
          <label>Symbol</label>
          <input list="chart-symbols" style={{ width: "100%" }} placeholder="AAPL"
                 value={form.symbol} onChange={(e) => upd("symbol", e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load()} />
          <datalist id="chart-symbols">
            {symbols.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.bars} {s.timeframe} bars</option>)}
          </datalist>
        </div>
        <div>
          <label>Timeframe</label>
          <select value={form.timeframe} onChange={(e) => upd("timeframe", e.target.value)} style={{ width: "100%" }}>
            {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div><label>Start date</label><input type="date" style={{ width: "100%" }} value={form.start} onChange={(e) => upd("start", e.target.value)} /></div>
        <div><label>End date</label><input type="date" style={{ width: "100%" }} value={form.end} onChange={(e) => upd("end", e.target.value)} /></div>
        <div><label>Max bars</label><input type="number" min="50" max="5000" style={{ width: "100%" }} value={form.limit} onChange={(e) => upd("limit", e.target.value)} /></div>
        <div>
          <label>MA type</label>
          <select value={form.maType} onChange={(e) => upd("maType", e.target.value)} style={{ width: "100%" }}>
            <option value="sma">SMA</option><option value="ema">EMA</option>
          </select>
        </div>
        <div>
          <label>MA #1</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.showMa1} onChange={(e) => upd("showMa1", e.target.checked)} />
            <input type="number" min="1" style={{ flex: 1 }} value={form.ma1} onChange={(e) => upd("ma1", e.target.value)} />
          </div>
        </div>
        <div>
          <label>MA #2</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.showMa2} onChange={(e) => upd("showMa2", e.target.checked)} />
            <input type="number" min="1" style={{ flex: 1 }} value={form.ma2} onChange={(e) => upd("ma2", e.target.value)} />
          </div>
        </div>
        <div>
          <label>Overlays</label>
          <div style={{ display: "flex", gap: 12, fontSize: 12, marginTop: 4, flexWrap: "wrap" }}>
            <label style={{ textTransform: "none" }}><input type="checkbox" checked={form.trend} onChange={(e) => upd("trend", e.target.checked)} /> trendline</label>
            <label style={{ textTransform: "none" }}><input type="checkbox" checked={form.volume} onChange={(e) => upd("volume", e.target.checked)} /> volume</label>
            <label style={{ textTransform: "none" }}><input type="checkbox" checked={form.logScale} onChange={(e) => upd("logScale", e.target.checked)} /> log scale</label>
          </div>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label>Strategy signals <span className="muted">(space / comma separated)</span></label>
          <input list="chart-strategies" style={{ width: "100%" }} placeholder="sma_cross rsi2 donchian"
                 value={form.strategyNames} onChange={(e) => upd("strategyNames", e.target.value)} />
          <datalist id="chart-strategies">
            {stratNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div>
          <label>Signals timeframe</label>
          <select value={form.signalTf} onChange={(e) => upd("signalTf", e.target.value)} style={{ width: "100%" }}>
            <option value="chart">Chart timeframe</option>
            <option value="auto">Each strategy's default</option>
          </select>
        </div>
        <div><button disabled={busy} onClick={() => load()} style={{ width: "100%" }}>{busy ? "Loading…" : "Reload"}</button></div>
      </div>

      {err && <div className="neg" style={{ marginTop: 10 }}>{err}</div>}

      {data.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={form.volume ? 360 : 440} style={{ marginTop: 14 }}>
            <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={AXIS} minTickGap={60} />
              <YAxis tick={AXIS} width={64} orientation="right" domain={yDomain}
                     allowDataOverflow scale={form.logScale ? "log" : "linear"}
                     tickFormatter={(v) => fmt(v, 2)} />
              <Tooltip content={<ChartTip />} />
              <Legend />
              <Bar dataKey="hl" name="OHLC" shape={<Candle />} isAnimationActive={false} legendType="none" />
              {form.showMa1 && Number(form.ma1) > 0 &&
                <Line dataKey="ma1" name={`${form.maType.toUpperCase()} ${form.ma1}`} stroke="#4da6ff" dot={false} strokeWidth={1.3} isAnimationActive={false} connectNulls />}
              {form.showMa2 && Number(form.ma2) > 0 &&
                <Line dataKey="ma2" name={`${form.maType.toUpperCase()} ${form.ma2}`} stroke="#e3b341" dot={false} strokeWidth={1.3} isAnimationActive={false} connectNulls />}
              {form.trend &&
                <Line dataKey="trend" name="Trendline" stroke="#8b949e" dot={false} strokeWidth={1.2} strokeDasharray="6 4" isAnimationActive={false} />}
              {sig && <Scatter dataKey="buy" name="Buy" shape={<BuyMark />} isAnimationActive={false} />}
              {sig && <Scatter dataKey="sell" name="Sell" shape={<SellMark />} isAnimationActive={false} />}
              {sig && <Scatter dataKey="exit" name="Exit" shape={<ExitMark />} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>

          {form.volume && (
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={data} margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={AXIS} minTickGap={60} height={16} />
                <YAxis tick={AXIS} width={64} orientation="right" tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ background: "#131820", border: `1px solid ${GRID}` }}
                         formatter={(v) => Number(v).toLocaleString()} labelFormatter={() => ""} />
                <Bar dataKey="volume" name="Volume" isAnimationActive={false}
                     shape={(p) => <rect x={p.x} y={p.y} width={p.width} height={p.height}
                                         fill={p.payload.close >= p.payload.open ? UP : DOWN} fillOpacity={0.5} />} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      {!data.length && !busy && (
        <div className="muted" style={{ marginTop: 16 }}>Enter a symbol — the chart reloads automatically as you change any parameter.</div>
      )}
    </div>
  );
}
