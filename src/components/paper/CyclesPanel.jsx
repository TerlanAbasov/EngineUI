import { useState } from "react";
import { api } from "../../api/client";
import { fmtDateTime } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";
import { Pager, StatusPill } from "./ui";

const SIZE = 30;

/** The job's run log: what each cycle looked at and did. */
export default function CyclesPanel() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = usePolling(() => api.liveCycles(page, SIZE), 10000, [page]);
  return (
    <div className="panel">
      {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
      <div className="table-scroll" style={{ maxHeight: 560 }}>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Started</th><th>Status</th><th>By</th><th style={{ textAlign: "right" }}>Took</th>
              <th style={{ textAlign: "right" }} title="Strategy signals evaluated">Signals</th>
              <th style={{ textAlign: "right" }} title="Orders planned / filled / failed">Orders</th>
              <th style={{ textAlign: "right" }} title="Virtual trades closed">Closed</th>
              <th style={{ textAlign: "right" }}>Errors</th><th>Result</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((c) => (
              <tr key={c.id}>
                <td className="muted">#{c.id}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.startedAt)}</td>
                <td><StatusPill value={c.status} />{c.mode === "FLATTEN" && <span className="tag" style={{ marginLeft: 4 }}>flatten</span>}{c.dryRun && <span className="tag" style={{ marginLeft: 4 }}>dry</span>}</td>
                <td className="muted">{c.triggeredBy.toLowerCase()}</td>
                <td style={{ textAlign: "right" }} className="muted">{c.durationMs == null ? "—" : `${(c.durationMs / 1000).toFixed(1)} s`}</td>
                <td style={{ textAlign: "right" }}>{c.signals ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{c.ordersPlanned == null ? "—" : `${c.ordersPlanned} / ${c.ordersFilled} / ${c.ordersFailed}`}</td>
                <td style={{ textAlign: "right" }}>{c.tradesClosed ?? "—"}</td>
                <td style={{ textAlign: "right" }} className={c.errors ? "neg" : "muted"}>{c.errors ?? "—"}</td>
                <td style={{ fontSize: 12, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    className={c.status === "FAILED" ? "neg" : "muted"} title={c.message || ""}>{c.message || ""}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={10} className="empty">No cycles yet.</td></tr>}
            {!data && <tr><td colSpan={10} className="empty">{loading ? "Loading…" : "—"}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} size={SIZE} total={data.total} onPage={setPage} />}
    </div>
  );
}
