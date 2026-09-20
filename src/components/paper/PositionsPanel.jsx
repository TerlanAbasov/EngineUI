import { api } from "../../api/client";
import { fmt, cls, fmtMoney, fmtPx } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";

/** What the Alpaca account holds next to what the strategies together want, so any gap is visible. */
export default function PositionsPanel() {
  const { data, error, loading } = usePolling(() => api.livePositions(), 10000, []);
  return (
    <div className="panel">
      {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th title="Shares the Alpaca paper account holds (negative = short)." style={{ textAlign: "right" }}>Account shares</th>
              <th title="The sum of every strategy's virtual position in this symbol." style={{ textAlign: "right" }}>Strategies' net</th>
              <th title="Whole shares the next cycle would still buy (+) or sell (−) to match the strategies. Non-zero means the account is not yet where the strategies want it." style={{ textAlign: "right" }}>To trade</th>
              <th style={{ textAlign: "right" }}>Price</th>
              <th style={{ textAlign: "right" }}>Market value</th>
              <th style={{ textAlign: "right" }}>Unrealized $</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((p) => (
              <tr key={p.symbol}>
                <td style={{ fontWeight: 600 }}>{p.symbol}{!p.managed && <span className="tag" style={{ marginLeft: 6 }} title="Held in the account but not by this job's strategies">not managed</span>}</td>
                <td style={{ textAlign: "right" }} className={cls(p.actualQty)}>{fmt(p.actualQty, p.actualQty % 1 === 0 ? 0 : 3)}</td>
                <td style={{ textAlign: "right" }}>{fmt(p.virtualQty, 2)}</td>
                <td style={{ textAlign: "right", color: Math.abs(p.gap) >= 1 ? "var(--amber)" : undefined }}>{Math.abs(p.gap) >= 0.5 ? fmt(p.gap, 0) : <span className="muted">0</span>}</td>
                <td style={{ textAlign: "right" }}>{p.price == null ? "—" : fmtPx(p.price)}</td>
                <td style={{ textAlign: "right" }}>{p.marketValue == null ? "—" : fmtMoney(p.marketValue)}</td>
                <td style={{ textAlign: "right" }} className={cls(p.unrealizedPl)}>{p.unrealizedPl == null ? "—" : fmtMoney(p.unrealizedPl)}</td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={7} className="empty">No positions in the account and none held by the strategies.</td></tr>}
            {!data && <tr><td colSpan={7} className="empty">{loading ? "Loading…" : "—"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
