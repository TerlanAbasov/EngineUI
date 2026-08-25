import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { fmt, cls, KPI_KEYS, TRADE_KEYS, downsample } from "../api/format";

const AXIS = { stroke: "#8b949e", fontSize: 11 };
const GRID = "#2a3441";

export default function ReportView({ result }) {
  if (!result) return null;
  const { strategy, symbols, start, end, metrics, dates, equity, benchmark, drawdown, trades } = result;

  const series = downsample(
    (dates || []).map((d, i) => ({
      date: d,
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
            <span className="tag">{start} → {end}</span>
            {result.runId != null && <span className="tag">run #{result.runId}</span>}
          </div>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          {KPI_KEYS.map(([k, label]) => (
            <div className="kpi" key={k}>
              <div className={`v ${cls(metrics?.[k])}`}>{fmt(metrics?.[k])}</div>
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
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <h3 style={{ marginTop: 0 }}>Trade Quality</h3>
            <table>
              <tbody>
                {TRADE_KEYS.map(([k, label]) => (
                  <tr key={k}><td className="muted">{label}</td><td>{fmt(metrics?.[k], k === "trades" ? 0 : 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: "2 1 480px" }}>
            <h3 style={{ marginTop: 0 }}>Recent Trades <span className="muted">({trades?.length || 0} total)</span></h3>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              <table>
                <thead>
                  <tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>Bars</th><th>Return %</th></tr>
                </thead>
                <tbody>
                  {(trades || []).slice(-40).reverse().map((t, i) => (
                    <tr key={i}>
                      <td>{t.symbol}</td>
                      <td><span className={`badge ${t.side}`}>{t.side}</span></td>
                      <td className="muted">{t.entryDate}</td>
                      <td className="muted">{t.exitDate}</td>
                      <td>{t.bars}</td>
                      <td className={cls(t.returnPct)}>{fmt(t.returnPct * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Commission + slippage charged on every fill; signals executed next bar (no look-ahead).
          Backtested results are not indicative of future performance.
        </p>
      </div>
    </div>
  );
}
