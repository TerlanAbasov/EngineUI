import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { TIMEFRAMES } from "../api/format";
import StrategyDetail from "./StrategyDetail";

const tfLabel = (id) => TIMEFRAMES.find((t) => t.id === id)?.label || id || "–";

export default function StrategyTable() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);          // expanded strategy name
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [dayOnly, setDayOnly] = useState(true);    // day-trading strategies only

  const load = () => api.strategies().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const patch = (dto) => setRows((rs) => rs.map((r) => (r.name === dto.name ? dto : r)));

  const toggle = async (name, enabled) => {
    setBusy(true);
    setRows((rs) => rs.map((r) => (r.name === name ? { ...r, enabled } : r)));
    try { await api.setEnabled(name, enabled); }
    catch (e) {
      setErr(e.message);
      setRows((rs) => rs.map((r) => (r.name === name ? { ...r, enabled: !enabled } : r)));
    } finally { setBusy(false); }
  };

  const toggleFav = async (r, e) => {
    e.stopPropagation();
    try { patch(await api.setStrategyControls(r.name, { favorite: !r.favorite })); }
    catch (err2) { setErr(err2.message); }
  };

  const setAll = async (enabled) => {
    setBusy(true);
    try { await Promise.all(visible.map((r) => api.setEnabled(r.name, enabled))); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.category))).sort()], [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (dayOnly && r.intraday === false) return false;
      if (favOnly && !r.favorite) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [rows, q, cat, favOnly, dayOnly]);

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Strategies <span className="muted" style={{ fontSize: 13 }}>({enabledCount}/{rows.length} enabled · {visible.length} shown)</span></h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="search name / category / tag" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="toggle-inline" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={dayOnly} onChange={(e) => setDayOnly(e.target.checked)} /> day-trading only
          </label>
          <label className="toggle-inline" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> ★ only
          </label>
          <button className="secondary" disabled={busy} onClick={() => setAll(true)}>Enable shown</button>
          <button className="secondary" disabled={busy} onClick={() => setAll(false)}>Disable shown</button>
        </div>
      </div>
      {err && <div className="neg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead>
          <tr>
            <th style={{ width: 24 }} />
            <th>Strategy</th><th>Category</th><th>Best TF</th><th>Day</th><th>Direction</th><th>Wt</th><th>Flags</th>
            <th style={{ textAlign: "left" }}>Description</th><th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <Fragment key={r.name}>
              <tr className="row-click" onClick={() => setOpen(open === r.name ? null : r.name)}>
                <td onClick={(e) => toggleFav(r, e)} title="favourite"
                    style={{ cursor: "pointer", color: r.favorite ? "#e3b341" : "#4b5563" }}>★</td>
                <td style={{ fontWeight: 600 }}>{open === r.name ? "▾ " : "▸ "}{r.name}</td>
                <td><span className="tag">{r.category}</span></td>
                <td className="muted">{tfLabel(r.recommendedTimeframe)}</td>
                <td style={{ textAlign: "center" }} title={r.intraday === false ? "not a day-trading strategy" : "day-trading suitable"}>
                  {r.intraday === false ? "–" : "✓"}
                </td>
                <td className="muted">
                  {r.direction}
                  {r.directionOverride && <span className="tag" style={{ marginLeft: 4 }}>override</span>}
                </td>
                <td className="muted">{r.weight != null && r.weight !== 1 ? r.weight : "–"}</td>
                <td>
                  {r.invert && <span className="badge SHORT" title="contrarian">INV</span>}
                  {(r.overridden || []).length > 0 && <span className="tag">{r.overridden.length}★par</span>}
                  {(r.tags || []).map((t) => <span key={t} className="tag" style={{ marginLeft: 2 }}>{t}</span>)}
                </td>
                <td style={{ textAlign: "left" }} className="muted">{r.description}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <label className="toggle">
                    <input type="checkbox" checked={r.enabled} disabled={busy}
                           onChange={(e) => toggle(r.name, e.target.checked)} />
                    <span className="slider" />
                  </label>
                </td>
              </tr>
              {open === r.name && (
                <tr>
                  <td colSpan={10} style={{ background: "#0d1117" }}>
                    <StrategyDetail strat={r} onSaved={patch} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
