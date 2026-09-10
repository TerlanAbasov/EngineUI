import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt, fmtDateTime, TIMEFRAMES } from "../api/format";

export default function Scanner() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [includeFlat, setIncludeFlat] = useState(false);
  const [timeframe, setTimeframe] = useState("AUTO");
  const [stale, setStale] = useState(false); // rows came from /api/signals, not a fresh scan
  const [exec, setExec] = useState({ configured: false });
  const [sending, setSending] = useState(null);

  // On mount, show the most recent persisted signals (from the poller or a prior
  // scan) and check whether ExecutionEngine forwarding is wired up.
  useEffect(() => {
    api.signals()
      .then((s) => { if (s && s.length) { setRows(s); setStale(true); } })
      .catch(() => {});
    api.executionStatus().then(setExec).catch(() => {});
  }, []);

  const scan = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { setRows(await api.scan(null, includeFlat, timeframe)); setStale(false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const forward = async (r) => {
    setSending(`${r.strategy}|${r.symbol}`); setErr(null); setMsg(null);
    try {
      await api.sendSignal(r);
      setMsg(`Forwarded ${r.signal} ${r.symbol} (${r.strategy}) to ExecutionEngine.`);
    } catch (e) { setErr(e.message); } finally { setSending(null); }
  };

  const newCount = rows ? rows.filter((r) => r.isNew).length : 0;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Scanner</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0, textTransform: "none" }}>
            timeframe
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="AUTO">Auto (per strategy)</option>
              {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0, textTransform: "none" }}>
            <input type="checkbox" checked={includeFlat} onChange={(e) => setIncludeFlat(e.target.checked)} /> include flat
          </label>
          <button disabled={busy} onClick={scan}>{busy ? "Scanning…" : "Run scan"}</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Runs every enabled strategy across the universe and reports the current position each rule would hold today.
        {" "}
        {exec.configured
          ? "ExecutionEngine forwarding is configured — use “Forward” on a LONG/SHORT row to push it now."
          : "ExecutionEngine forwarding is not configured (set quantplat.execution-engine.base-url on the backend)."}
      </p>
      {err && <div className="neg" style={{ marginBottom: 8 }}>{err}</div>}
      {msg && <div className="pos" style={{ marginBottom: 8 }}>{msg}</div>}
      {rows && (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>
            {rows.length} signals · <span className="new-dot">{newCount} new</span>
            {stale && " · showing last persisted signals — click “Run scan” to refresh"}
          </div>
          <div className="table-scroll" style={{ maxHeight: "65vh" }}>
          <table>
            <thead>
              <tr>
                <th></th><th>Strategy</th><th>Category</th><th>TF</th><th>Symbol</th><th>Signal</th>
                <th>Bars</th><th>Weight</th><th>Close</th><th>As of</th>
                {exec.configured && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.isNew ? <span className="new-dot" title="newly flipped">●</span> : ""}</td>
                  <td style={{ fontWeight: 600 }}>{r.strategy}</td>
                  <td><span className="tag">{r.category}</span></td>
                  <td className="muted">{(TIMEFRAMES.find((t) => t.id === r.timeframe)?.label) || r.timeframe || "–"}</td>
                  <td>{r.symbol}</td>
                  <td><span className={`badge ${r.signal}`}>{r.signal}</span></td>
                  <td>{r.bars}</td>
                  <td>{fmt(r.weight)}</td>
                  <td>{fmt(r.close)}</td>
                  <td className="muted">{fmtDateTime(r.date)}</td>
                  {exec.configured && (
                    <td>
                      {r.signal !== "FLAT" && (
                        <button
                          className="secondary"
                          disabled={sending === `${r.strategy}|${r.symbol}`}
                          onClick={() => forward(r)}
                        >
                          {sending === `${r.strategy}|${r.symbol}` ? "Sending…" : "Forward"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
      {!rows && !busy && <div className="spinner">Click “Run scan” to generate current signals.</div>}
    </div>
  );
}
