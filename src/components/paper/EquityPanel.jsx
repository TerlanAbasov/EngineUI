import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { fmtMoney, fmtDateTime } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";

const RANGES = [["6 hours", 6], ["24 hours", 24], ["3 days", 72], ["7 days", 168], ["30 days", 720]];

/** The Alpaca paper account's equity, recorded at the end of every cycle. */
export default function EquityPanel() {
  const [hours, setHours] = useState(72);
  const { data, error, loading } = usePolling(() => api.liveEquity(hours), 30000, [hours]);
  const points = useMemo(() => (data || []).map((p) => ({ t: new Date(p.ts).getTime(), equity: p.equity })), [data]);
  const lo = points.length ? Math.min(...points.map((p) => p.equity)) : 0;
  const hi = points.length ? Math.max(...points.map((p) => p.equity)) : 0;
  const pad = Math.max(1, (hi - lo) * 0.1);
  const change = points.length > 1 ? points[points.length - 1].equity - points[0].equity : 0;

  return (
    <div className="panel">
      <div className="filters">
        <div className="field">
          <label>Range</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {RANGES.map(([l, h]) => <option key={h} value={h}>{l}</option>)}
          </select>
        </div>
        {points.length > 1 && (
          <span className="count">
            {fmtMoney(points[0].equity)} → {fmtMoney(points[points.length - 1].equity)} ·{" "}
            <span className={change > 0 ? "pos" : change < 0 ? "neg" : ""}>{change >= 0 ? "+" : ""}{fmtMoney(change)}</span>
          </span>
        )}
      </div>
      {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
      {points.length < 2 ? (
        <div className="empty">{loading ? "Loading…" : "The curve appears once at least two cycles have run."}</div>
      ) : (
        <div style={{ height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} stroke="#8b949e" fontSize={11}
                     tickFormatter={(t) => new Date(t).toISOString().slice(5, 16).replace("T", " ")} />
              <YAxis stroke="#8b949e" fontSize={11} width={72} domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
                     tickFormatter={(v) => `$${Math.round(v).toLocaleString("en-US")}`} />
              <Tooltip labelFormatter={(t) => fmtDateTime(new Date(t).toISOString())} formatter={(v) => [fmtMoney(v), "Equity"]}
                       contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-strong)" }} />
              <Line type="monotone" dataKey="equity" stroke="var(--accent)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
