import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function StrategyTable() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.strategies().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const toggle = async (name, enabled) => {
    setBusy(true);
    // optimistic update
    setRows((rs) => rs.map((r) => (r.name === name ? { ...r, enabled } : r)));
    try {
      await api.setEnabled(name, enabled);
    } catch (e) {
      setErr(e.message);
      setRows((rs) => rs.map((r) => (r.name === name ? { ...r, enabled: !enabled } : r)));
    } finally {
      setBusy(false);
    }
  };

  const setAll = async (enabled) => {
    setBusy(true);
    try {
      await Promise.all(rows.map((r) => api.setEnabled(r.name, enabled)));
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Strategies <span className="muted" style={{ fontSize: 13 }}>({enabledCount}/{rows.length} enabled)</span></h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" disabled={busy} onClick={() => setAll(true)}>Enable all</button>
          <button className="secondary" disabled={busy} onClick={() => setAll(false)}>Disable all</button>
        </div>
      </div>
      {err && <div className="neg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead>
          <tr>
            <th>Strategy</th><th>Category</th><th>Direction</th>
            <th style={{ textAlign: "left" }}>Description</th><th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td><span className="tag">{r.category}</span></td>
              <td className="muted">{r.direction}</td>
              <td style={{ textAlign: "left" }} className="muted">{r.description}</td>
              <td>
                <label className="toggle">
                  <input type="checkbox" checked={r.enabled} disabled={busy}
                         onChange={(e) => toggle(r.name, e.target.checked)} />
                  <span className="slider" />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
