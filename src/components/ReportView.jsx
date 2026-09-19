import { useState } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { fmt, cls, fmtDate, KPI_KEYS, TRADE_KEYS, RISK_KEYS, LONGSHORT_ROWS, METRIC_HELP, downsample } from "../api/format";
import SymbolResults from "./SymbolResults";
import TradesTable from "./TradesTable";

const AXIS = { stroke: "#8b949e", fontSize: 11 };
const GRID = "#2a3441";

export default function ReportView({ result }) {
  // symbol the trades table is filtered to: picked in the results-by-symbol table, or in the trades filter itself
  const [tradeSymbol, setTradeSymbol] = useState("");
  if (!result) return null;
  const { strategy, symbols, start, end, metrics, dates, equity, benchmark, drawdown,
          timeframe, bars, runId, tradeCount } = result;
  const m = metrics || {};
  const tradeSymbols = result.symbolResults?.length ? result.symbolResults.map((r) => r.symbol) : (symbols || []);

  const series = downsample(
    (dates || []).map((d, i) => ({
      date: fmtDate(d),
      equity: equity?.[i],
      benchmark: benchmark?.[i],
      drawdown: drawdown?.[i] != null ? drawdown[i] * 100 : null,
    }))
  );

  return (
    <div>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>{strategy}</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="tag">{symbols?.length} symbols</span>
            <span className="tag">{fmtDate(start)} → {fmtDate(end)}</span>
            {timeframe && <span className="tag">{timeframe === "NATIVE" ? "native bars" : timeframe}</span>}
            {bars != null && <span className="tag">{bars} bars</span>}
            {result.runId != null && <span className="tag">run #{result.runId}</span>}
          </div>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          {KPI_KEYS.map(([k, label]) => (
            <div className="kpi" key={k} title={METRIC_HELP[k]}>
              <div className={`v ${cls(m[k])}`}>{fmt(m[k])}</div>
              <div className="l">{label}</div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Returns are on starting capital (fixed position size, not compounded) — total return ≈ the sum of every trade's P&amp;L.
        </p>
      </div>

      <SymbolResults result={result} selected={tradeSymbol} onSelect={setTradeSymbol} />

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Long vs Short</h3>
        <table>
          <thead>
            <tr><th /><th style={{ textAlign: "right" }}>Long</th><th style={{ textAlign: "right" }}>Short</th></tr>
          </thead>
          <tbody>
            {LONGSHORT_ROWS.map(([label, lk, sk, d]) => (
              <tr key={label}>
                <td className="muted">{label}</td>
                <td className={cls(m[lk])} style={{ textAlign: "right" }}>{fmt(m[lk], d)}</td>
                <td className={cls(m[sk])} style={{ textAlign: "right" }}>{fmt(m[sk], d)}</td>
              </tr>
            ))}
            <tr>
              <td className="muted">Avg bars held</td>
              <td style={{ textAlign: "right" }}>{fmt(m.longAvgBarsHeld ?? m.avgBarsHeld, 1)}</td>
              <td style={{ textAlign: "right" }}>{fmt(m.shortAvgBarsHeld ?? m.avgBarsHeld, 1)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Operations = closed round-trips per side. Exposure = share of bars holding that side
          (portfolio runs net long/short across symbols, so the split is approximate there).
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Risk &amp; Robustness</h3>
        <div className="kpis">
          {RISK_KEYS.map(([k, label]) => (
            <div className="kpi" key={k} title={METRIC_HELP[k]}>
              <div className="v">{fmt(m[k], k === "maxDrawdownDays" || k === "annTurnoverPct" ? 0 : 2)}</div>
              <div className="l">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Equity vs Buy &amp; Hold</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={AXIS} minTickGap={60} />
            <YAxis tick={AXIS} width={70} domain={["auto", "auto"]}
                   tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: "#131820", border: `1px solid ${GRID}` }}
                     formatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Legend />
            <Line type="monotone" dataKey="equity" name="Strategy" stroke="#4da6ff" dot={false} strokeWidth={1.8} />
            <Line type="monotone" dataKey="benchmark" name="Buy & Hold" stroke="#8b949e" dot={false} strokeWidth={1.1} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Drawdown %</h3>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={AXIS} minTickGap={60} />
            <YAxis tick={AXIS} width={50} />
            <Tooltip contentStyle={{ background: "#131820", border: `1px solid ${GRID}` }}
                     formatter={(v) => `${Number(v).toFixed(1)}%`} />
            <Area type="monotone" dataKey="drawdown" stroke="#f85149" fill="#f85149" fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Trade Quality</h3>
        <table>
          <tbody>
            {TRADE_KEYS.map(([k, label]) => {
              const d = ["trades", "maxWinStreak", "maxLossStreak"].includes(k) ? 0 : k === "tradesPerYear" ? 1 : 2;
              return <tr key={k} title={METRIC_HELP[k]}><td className="muted">{label}</td><td className={cls(k === "worstTradePct" ? -1 : k === "bestTradePct" ? 1 : 0)}>{fmt(metrics?.[k], d)}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Commission + slippage are charged on every fill. A signal on one bar's close puts the position on for the
          next bar, filled at that close. Backtested results are not indicative of future performance.
        </p>
      </div>

      {runId != null && (
        <TradesTable runId={runId} tradeCount={tradeCount ?? 0} symbols={tradeSymbols}
                     symbol={tradeSymbol} onSymbolChange={setTradeSymbol} />
      )}
    </div>
  );
}
