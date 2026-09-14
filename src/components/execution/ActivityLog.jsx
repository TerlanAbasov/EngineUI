const fmtTime = (d) => d.toLocaleTimeString([], { hour12: false });

// ExecutionEngine's /trades/command endpoint always answers 200 — even when the
// dispatcher caught an internal error — and signals failure only via a "❌"-prefixed
// message body. Detect that here so the log can still show it as an error.
const isErrorMessage = (msg) => typeof msg === "string" && msg.trim().startsWith("❌");

export default function ActivityLog({ entries, onClear }) {
  return (
    <div className="panel" style={{ position: "sticky", top: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Activity <span className="count">({entries.length})</span></h3>
        {entries.length > 0 && <button className="secondary xs" onClick={onClear}>Clear</button>}
      </div>
      {entries.length === 0 ? (
        <div className="empty">Actions you send will show up here, newest first.</div>
      ) : (
        <div className="log-list" style={{ maxHeight: 560 }}>
          {entries.map((e) => {
            const failed = e.ok === false || isErrorMessage(e.message);
            return (
              <div key={e.id} className={`log-entry ${failed ? "err" : ""}`}>
                <div className="log-head">
                  <span>{e.label}</span>
                  <span>{fmtTime(e.time)}</span>
                </div>
                <div className={`log-msg ${failed ? "neg" : ""}`}>{e.message}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
