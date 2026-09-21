import { useState } from "react";
import { api } from "../../api/client";
import { fmt, fmtPx, fmtDateTime } from "../../api/format";
import { usePolling } from "../../hooks/usePolling";
import { Pager, StatusPill } from "../paper/ui";

const SIZE = 25;

/** Every command the job decided to send, newest first, with what ExecutionEngine answered. */
export default function AutoTradeCommands() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = usePolling(() => api.autoTradeCommands(page, SIZE), 10000, [page]);
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Commands sent to ExecutionEngine {data && <span className="count">· {data.total.toLocaleString("en-US")} in total</span>}</h3>
      {error && <div className="neg" style={{ marginBottom: 8 }}>Could not load: {error}</div>}
      <div className="table-scroll" style={{ maxHeight: 520 }}>
        <table>
          <thead>
            <tr>
              <th>Time</th><th>Strategy</th><th>Symbol</th><th>Frame</th>
              <th title="Open time of the bar whose completion triggered the command">Bar</th>
              <th>Side</th><th style={{ textAlign: "right" }}>Qty</th><th>Type</th><th>Status</th><th style={{ textAlign: "left" }}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((c) => (
              <tr key={c.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.createdAt)}</td>
                <td>{c.strategy}</td>
                <td style={{ fontWeight: 600 }}>{c.symbol}</td>
                <td className="muted">{c.timeframe}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.barOpen)}</td>
                <td><span className={`badge ${c.side === "BUY" ? "LONG" : "SHORT"}`}>{c.side}</span></td>
                <td style={{ textAlign: "right" }}>{fmt(c.quantity, Number.isInteger(c.quantity) ? 0 : 2)}</td>
                <td className="muted">{c.orderType}{c.limitPrice != null ? ` @ ${fmtPx(c.limitPrice)}` : ""}</td>
                <td><StatusPill value={c.status} /></td>
                <td className={c.status === "REJECTED" || c.status === "FAILED" ? "neg" : "muted"}
                    style={{ fontSize: 12, textAlign: "left", minWidth: 220, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={c.response || ""}>{c.response || ""}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={10} className="empty">No commands yet. They appear when a strategy turns LONG or SHORT on a bar that completes while auto trading is on.</td></tr>
            )}
            {!data && <tr><td colSpan={10} className="empty">{loading ? "Loading…" : "—"}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} size={SIZE} total={data.total} onPage={setPage} />}
    </div>
  );
}
