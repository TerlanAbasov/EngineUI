import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function UniverseEditor() {
  const [symbols, setSymbols] = useState([]);
  const [input, setInput] = useState("");
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.universe().then(setSymbols).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const save = async (next) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const saved = await api.setUniverse(next);
      setSymbols(saved);
      setMsg("Universe saved.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const add = () => {
    const parsed = input.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!parsed.length) return;
    const next = Array.from(new Set([...symbols, ...parsed])).sort();
    setInput("");
    save(next);
  };

  const remove = (sym) => save(symbols.filter((s) => s !== sym));

  const pull = async () => {
    if (!symbols.length) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await api.pull(symbols);
      const total = Object.values(res).reduce((a, b) => a + b, 0);
      setMsg(`Pulled/refreshed ${total} bars across ${Object.keys(res).length} symbols.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Universe <span className="muted" style={{ fontSize: 13 }}>({symbols.length} symbols)</span></h2>
      <p className="muted" style={{ marginTop: 0 }}>
        The stock list every strategy scans and backtests. Add your own tickers — they must be
        resolvable by your active data source (any symbol works on synthetic; valid IB contracts on ib).
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input style={{ flex: 1 }} placeholder="Add tickers, e.g. AAPL, MSFT, TSLA"
               value={input} onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && add()} />
        <button disabled={busy} onClick={add}>Add</button>
        <button className="secondary" disabled={busy} onClick={pull}>Pull data</button>
      </div>
      {err && <div className="neg" style={{ marginBottom: 8 }}>{err}</div>}
      {msg && <div className="pos" style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {symbols.map((s) => (
          <span key={s} className="tag" style={{ fontSize: 13, display: "inline-flex", gap: 8, alignItems: "center" }}>
            {s}
            <span className="row-click neg" title="remove" onClick={() => remove(s)} style={{ fontWeight: 700 }}>×</span>
          </span>
        ))}
        {!symbols.length && <span className="muted">No symbols yet — add some above.</span>}
      </div>
    </div>
  );
}
