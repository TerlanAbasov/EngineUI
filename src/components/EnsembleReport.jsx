import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { fmt, cls, fmtDate, downsample } from "../api/format";

const AXIS = { stroke: "#8b949e", fontSize: 11 };
const GRID = "#2a3441";

const KPI = [
  ["totalReturnPct", "Total Return %"], ["cagrPct", "CAGR %"], ["sharpe", "Sharpe"],
  ["sortino", "Sortino"], ["calmar", "Calmar"], ["maxDrawdownPct", "Max DD %"],
  ["annVolPct", "Ann Vol %"], ["ulcerIndex", "Ulcer"],
];

export default function EnsembleReport({ result }) {
  if (!result) return null;
  const { symbols, start, end, timeframe, bars, weighting, metrics, dates, equity, benchmark, drawdown, legs } = result;
  const m = metrics || {};
  const series = downsample((dates || []).map((d, i) => ({
    date: fmtDate(d), equity: equity?.[i], benchmark: benchmark?.[i],
    drawdown: drawdown?.[i] != null ? drawdown[i] * 100 : null,
  })));

  return (
    <div>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Ensemble <span className="muted">({legs?.length} strategies · {weighting}-weighted)</span></h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="tag">{symbols?.length} symbols</span>
            <span className="tag">{fmtDate(start)} → {fmtDate(end)}</span>
            {timeframe && <span className="tag">{timeframe === "NATIVE" ? "native bars" : timeframe === "PER_STRATEGY" ? "per-strategy TF" : timeframe}</span>}
            {bars != null && <span className="tag">{bars} bars</span>}
          </div>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          {KPI.map(([k, label]) => (
            <div className="kpi" key={k}>
              <div className={`v ${cls(m[k])}`}>{fmt(m[k])}</div>
              <div className="l">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Blended Equity vs Buy &amp; Hold</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={AXIS} minTickGap={60} />
            <YAxis tick={AXIS} width={70} domain={["auto", "auto"]} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ background: "#131820", border: `1px solid ${GRID}` }}
                     formatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Legend />
            <Line type="monotone" dataKey="equity" name="Ensemble" stroke="#4da6ff" dot={false} strokeWidth={1.8} />
            <Line type="monotone" dataKey="benchmark" name="Buy & Hold" stroke="#8b949e" dot={false} strokeWidth={1.1} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Legs <span className="muted">(standalone metrics · sorted by weight)</span></h3>
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          <table>
            <thead>
              <tr><th>Strategy</th><th>Weight</th><th>Return %</th><th>Sharpe</th><th>Calmar</th><th>Max DD %</th><th>Trades</th></tr>
            </thead>
            <tbody>
              {(legs || []).map((l) => (
                <tr key={l.strategy}>
                  <td style={{ fontWeight: 600 }}>{l.strategy}</td>
                  <td>{(l.weight * 100).toFixed(1)}%</td>
                  <td className={cls(l.metrics?.totalReturnPct)}>{fmt(l.metrics?.totalReturnPct)}</td>
                  <td className={cls(l.metrics?.sharpe)}>{fmt(l.metrics?.sharpe)}</td>
                  <td className={cls(l.metrics?.calmar)}>{fmt(l.metrics?.calmar)}</td>
                  <td className="neg">{fmt(l.metrics?.maxDrawdownPct)}</td>
                  <td>{fmt(l.metrics?.trades, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Each leg is backtested on the same universe; their daily returns are combined by weight and
          rebalanced every bar. Weights shown are normalised to 100%.
        </p>
      </div>
    </div>
  );
}
