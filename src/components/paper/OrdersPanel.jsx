import { useState } from "react";
import { api } from "../../api/client";
import { fmt, fmtPx, fmtDateTime } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";
import { Pager, StatusPill } from "./ui";

const SIZE = 50;

/** Orders the job sent to Alpaca (or, in a dry run, would have sent): one net order per symbol per cycle. */
export default function OrdersPanel() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = usePolling(() => api.liveOrders(page, SIZE), 10000, [page]);
  return (
    <div className="panel">
      {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
      <div className="table-scroll" style={{ maxHeight: 560 }}>
        <table>
          <thead>
            <tr>
              <th>Time</th><th>Symbol</th><th>Side</th><th style={{ textAlign: "right" }}>Shares</th><th>Status</th>
              <th style={{ textAlign: "right" }}>Filled</th><th style={{ textAlign: "right" }}>Fill price</th>
              <th style={{ textAlign: "right" }} title="Whole-share position the strategies together wanted">Target</th>
              <th title="Cycle number">Cycle</th><th>Why</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((o) => (
              <tr key={o.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(o.submittedAt)}</td>
                <td style={{ fontWeight: 600 }}>{o.symbol}</td>
                <td>{o.side === "-" ? "—" : <span className={`badge ${o.side === "BUY" ? "LONG" : "SHORT"}`}>{o.side}</span>}</td>
                <td style={{ textAlign: "right" }}>{o.qty ? fmt(o.qty, 0) : "—"}</td>
                <td><StatusPill value={o.status} />{o.dryRun && o.status !== "DRY_RUN" && <span className="tag" style={{ marginLeft: 4 }}>dry</span>}</td>
                <td style={{ textAlign: "right" }}>{o.filledQty == null ? "—" : fmt(o.filledQty, 0)}</td>
                <td style={{ textAlign: "right" }}>{o.filledAvgPrice == null ? "—" : fmtPx(o.filledAvgPrice)}</td>
                <td style={{ textAlign: "right" }}>{o.targetQty == null ? "—" : fmt(o.targetQty, 0)}</td>
                <td className="muted">#{o.cycleId}</td>
                <td className={o.error ? "neg" : "muted"} style={{ fontSize: 12, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={o.error || o.reason || ""}>{o.error || o.reason || ""}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={10} className="empty">No orders yet.</td></tr>}
            {!data && <tr><td colSpan={10} className="empty">{loading ? "Loading…" : "—"}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} size={SIZE} total={data.total} onPage={setPage} />}
    </div>
  );
}
