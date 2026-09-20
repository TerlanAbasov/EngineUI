import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { fmt, cls, fmtMoney, fmtPx, fmtAgo, fmtDateTime } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";
import { useNow } from "../../hooks/useNow";

const COLS = [
  ["strategy", "Strategy", "str", null],
  ["openPositions", "Open", "num", "Open virtual positions (long / short)."],
  ["realizedPnl", "Realized $", "num", "Profit or loss of this strategy's closed trades."],
  ["unrealizedPnl", "Unrealized $", "num", "Open profit or loss at the last price."],
  ["totalPnl", "Total $", "num", "Realized plus unrealized."],
  ["returnPct", "Return %", "num", "Total P&L as a % of the capital allocated to the strategy (allocation × symbols)."],
  ["trades", "Trades", "num", "Closed trades."],
  ["winRatePct", "Win %", "num", "Share of closed trades that made money."],
  ["lastSignalAt", "Last checked", "str", "When the strategy was last evaluated."],
];

/** Each strategy's real-time result on the paper account (its own virtual positions), with a drill-down. */
export default function StrategiesPanel() {
  const { data, error, loading } = usePolling(() => api.liveStrategies(), 10000, []);
  const now = useNow(1000);
  const [sort, setSort] = useState({ key: "totalPnl", dir: -1 });
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);

  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = (data || []).filter((r) => !f || r.strategy.toLowerCase().includes(f));
    const val = (r) => (sort.key === "openPositions" ? r.openPositions : r[sort.key]);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const nx = x == null, ny = y == null;
      if (nx || ny) return nx === ny ? a.strategy.localeCompare(b.strategy) : nx ? 1 : -1;
      const c = typeof x === "string" ? x.localeCompare(y) : x - y;
      return c === 0 ? a.strategy.localeCompare(b.strategy) : sort.dir * c;
    });
  }, [data, sort, q]);

  const totals = useMemo(() => (data || []).reduce((t, r) => ({
    realized: t.realized + r.realizedPnl, unrealized: t.unrealized + r.unrealizedPnl, trades: t.trades + r.trades, open: t.open + r.openPositions,
  }), { realized: 0, unrealized: 0, trades: 0, open: 0 }), [data]);

  const clickSort = (key, type) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: type === "str" ? 1 : -1 }));
  const arrow = (k) => (sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  return (
    <>
      <div className="panel">
        <div className="filters">
          <div className="field">
            <label>Strategy</label>
            <input placeholder="search name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="count">click a header to sort · click a row for its positions, trades and curve</span>
        </div>
        {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
        <div className="table-scroll" style={{ maxHeight: 520 }}>
          <table>
            <thead>
              <tr>
                {COLS.map(([k, label, type, tip]) => (
                  <th key={k} className="row-click" title={tip || undefined} onClick={() => clickSort(k, type)}
                      style={type === "num" ? { textAlign: "right" } : undefined}>{label}{arrow(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.strategy} className="row-click" onClick={() => setPicked(picked === r.strategy ? null : r.strategy)}
                    style={picked === r.strategy ? { background: "#161d29" } : undefined}>
                  <td style={{ fontWeight: 600 }}>{r.strategy}{!r.inScope && <span className="tag" style={{ marginLeft: 6 }} title="No longer selected: its positions are being closed">removed</span>}</td>
                  <td style={{ textAlign: "right" }}>{r.openPositions > 0 ? <>{r.openPositions} <span className="muted">({r.longs}L / {r.shorts}S)</span></> : <span className="muted">0</span>}</td>
                  <td className={cls(r.realizedPnl)} style={{ textAlign: "right" }}>{fmtMoney(r.realizedPnl)}</td>
                  <td className={cls(r.unrealizedPnl)} style={{ textAlign: "right" }}>{fmtMoney(r.unrealizedPnl)}</td>
                  <td className={cls(r.totalPnl)} style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.totalPnl)}</td>
                  <td className={cls(r.returnPct)} style={{ textAlign: "right" }}>{fmt(r.returnPct)}</td>
                  <td style={{ textAlign: "right" }}>{r.trades}</td>
                  <td style={{ textAlign: "right" }}>{r.winRatePct == null ? <span className="muted">—</span> : fmt(r.winRatePct, 0)}</td>
                  <td className="muted">{fmtAgo(r.lastSignalAt, now)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLS.length} className="empty">{loading ? "Loading…" : data && data.length ? "No strategy matches." : "No strategies yet — start the job or press Run now."}</td></tr>
              )}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>All strategies</td>
                  <td style={{ textAlign: "right" }}>{totals.open}</td>
                  <td className={cls(totals.realized)} style={{ textAlign: "right" }}>{fmtMoney(totals.realized)}</td>
                  <td className={cls(totals.unrealized)} style={{ textAlign: "right" }}>{fmtMoney(totals.unrealized)}</td>
                  <td className={cls(totals.realized + totals.unrealized)} style={{ textAlign: "right" }}>{fmtMoney(totals.realized + totals.unrealized)}</td>
                  <td /><td style={{ textAlign: "right" }}>{totals.trades}</td><td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          The Alpaca account holds one net position per symbol, so each strategy's own position is tracked separately:
          it opens and closes at the price of the order that filled, and P&amp;L is what that virtual position earned.
        </p>
      </div>
      {picked && <StrategyDetail name={picked} onClose={() => setPicked(null)} />}
    </>
  );
}

function StrategyDetail({ name, onClose }) {
  const { data, error } = usePolling(() => api.liveStrategy(name, 100), 15000, [name]);
  const now = useNow(1000);
  const curve = useMemo(() => (data?.curve || []).map((p) => ({ t: new Date(p.ts).getTime(), total: +p.total.toFixed(2) })), [data]);
  if (!data) return <div className="panel">{error ? <span className="neg">Could not load {name}: {error}</span> : <span className="muted">Loading {name}…</span>}</div>;
  const s = data.summary;
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{name} <span className="count">· {s.trades} closed trade{s.trades === 1 ? "" : "s"}</span></h3>
        <button className="secondary xs" onClick={onClose}>close</button>
      </div>
      <div className="stat-grid">
        <div className="stat"><div className="k">Total P&amp;L</div><div className={`v ${cls(s.totalPnl)}`}>{fmtMoney(s.totalPnl)}</div><div className="sub">{fmt(s.returnPct)}% of allocated capital</div></div>
        <div className="stat"><div className="k">Realized</div><div className={`v ${cls(s.realizedPnl)}`}>{fmtMoney(s.realizedPnl)}</div></div>
        <div className="stat"><div className="k">Unrealized</div><div className={`v ${cls(s.unrealizedPnl)}`}>{fmtMoney(s.unrealizedPnl)}</div></div>
        <div className="stat"><div className="k">Win rate</div><div className="v">{s.winRatePct == null ? "—" : `${fmt(s.winRatePct, 0)}%`}</div><div className="sub">{s.wins} of {s.trades}</div></div>
      </div>

      {curve.length > 1 && (
        <div style={{ height: 180, margin: "6px 0 10px" }}>
          <ResponsiveContainer>
            <AreaChart data={curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} stroke="#8b949e" fontSize={11}
                     tickFormatter={(t) => new Date(t).toISOString().slice(5, 16).replace("T", " ")} />
              <YAxis stroke="#8b949e" fontSize={11} width={56} tickFormatter={(v) => `$${v}`} />
              <Tooltip labelFormatter={(t) => fmtDateTime(new Date(t).toISOString())} formatter={(v) => [fmtMoney(v), "P&L"]}
                       contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-strong)" }} />
              <Area type="monotone" dataKey="total" stroke="var(--accent)" fill="var(--accent-soft)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <h4 style={{ margin: "10px 0 6px" }}>Positions by symbol</h4>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Symbol</th><th>Side</th><th>Shares</th><th>Entry</th><th>Last</th><th>Unrealized $</th><th>Realized $</th><th>Signal</th><th>Checked</th></tr></thead>
          <tbody>
            {data.slots.map((sl) => (
              <tr key={sl.symbol}>
                <td style={{ fontWeight: 600 }}>{sl.symbol}</td>
                <td>{sl.direction === 0 ? <span className="badge FLAT">FLAT</span> : <span className={`badge ${sl.direction > 0 ? "LONG" : "SHORT"}`}>{sl.direction > 0 ? "LONG" : "SHORT"}</span>}
                  {sl.blockedDir !== 0 && <span className="tag" style={{ marginLeft: 6 }} title="Stopped out: stays closed until the signal changes">stopped</span>}</td>
                <td>{sl.direction === 0 ? "—" : fmt(sl.qty, 3)}</td>
                <td>{sl.entryPrice == null ? "—" : fmtPx(sl.entryPrice)}</td>
                <td>{sl.lastPrice == null ? "—" : fmtPx(sl.lastPrice)}</td>
                <td className={cls(sl.unrealizedPnl)}>{fmtMoney(sl.unrealizedPnl)}</td>
                <td className={cls(sl.realizedPnl)}>{fmtMoney(sl.realizedPnl)}</td>
                <td>{sl.lastSignal == null ? "—" : fmt(sl.lastSignal, 2)}</td>
                <td className="muted">{fmtAgo(sl.lastSignalAt, now)}</td>
              </tr>
            ))}
            {data.slots.length === 0 && <tr><td colSpan={9} className="empty">No positions yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: "14px 0 6px" }}>Closed trades <span className="count">· latest {data.trades.length}</span></h4>
      <div className="table-scroll" style={{ maxHeight: 320 }}>
        <table>
          <thead><tr><th>Symbol</th><th>Side</th><th>Shares</th><th>Entry</th><th>Entry price</th><th>Exit</th><th>Exit price</th><th>P&amp;L $</th><th>Return %</th><th>Reason</th></tr></thead>
          <tbody>
            {data.trades.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td><span className={`badge ${t.side}`}>{t.side}</span></td>
                <td>{fmt(t.qty, 3)}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.entryTime)}</td>
                <td>{fmtPx(t.entryPrice)}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.exitTime)}</td>
                <td>{fmtPx(t.exitPrice)}</td>
                <td className={cls(t.pnlUsd)}>{fmtMoney(t.pnlUsd)}</td>
                <td className={cls(t.returnPct)}>{fmt(t.returnPct)}</td>
                <td className="muted">{t.exitReason.replace("_", " ").toLowerCase()}</td>
              </tr>
            ))}
            {data.trades.length === 0 && <tr><td colSpan={10} className="empty">No closed trades yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
