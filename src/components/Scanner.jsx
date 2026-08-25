import { useState } from "react";
import { api } from "../api/client";
import { fmt } from "../api/format";

export default function Scanner() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [includeFlat, setIncludeFlat] = useState(false);

  const scan = async () => {
    setBusy(true); setErr(null);
    try { setRows(await api.scan(null, includeFlat)); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const newCount = rows ? rows.filter((r) => r.isNew).length : 0;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Scanner</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0, textTransform: "none" }}>
            <input type="checkbox" checked={includeFlat} onChange={(e) => setIncludeFlat(e.target.checked)} /> include flat
          </label>
          <button disabled={busy} onClick={scan}>{busy ? "Scanning…" : "Run scan"}</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Runs every enabled strategy across the universe and reports the current position each rule would hold today.
      </p>
      {err && <div className="neg" style={{ marginBottom: 8 }}>{err}</div>}
      {rows && (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>
            {rows.length} signals · <span className="new-dot">{newCount} new today</span>
          </div>
          <table>
            <thead>
              <tr><th></th><th>Strategy</th><th>Category</th><th>Symbol</th><th>Signal</th><th>Bars</th><th>Weight</th><th>Close</th><th>As of</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.isNew ? <span className="new-dot" title="new today">●</span> : ""}</td>
                  <td style={{ fontWeight: 600 }}>{r.strategy}</td>
                  <td><span className="tag">{r.category}</span></td>
                  <td>{r.symbol}</td>
                  <td><span className={`badge ${r.signal}`}>{r.signal}</span></td>
                  <td>{r.bars}</td>
                  <td>{fmt(r.weight)}</td>
                  <td>{fmt(r.close)}</td>
                  <td className="muted">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {!rows && !busy && <div className="spinner">Click “Run scan” to generate current signals.</div>}
    </div>
  );
}
