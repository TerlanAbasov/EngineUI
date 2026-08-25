import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt, cls, KPI_KEYS } from "../api/format";
import ReportView from "./ReportView";

export default function BacktestPanel() {
  const [strategies, setStrategies] = useState([]);
  const [form, setForm] = useState({
    strategyName: "ALL",
    symbols: "",
    start: "",
    end: "",
    capital: 100000,
    commissionBps: 1,
    slippageBps: 2,
    allowShort: true,
  });
  const [leaderboard, setLeaderboard] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { api.strategies().then(setStrategies).catch((e) => setErr(e.message)); }, []);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const body = () => ({
    strategyName: form.strategyName,
    symbols: form.symbols.trim() ? form.symbols.split(/[,\s]+/).map((s) => s.toUpperCase()).filter(Boolean) : null,
    start: form.start || null,
    end: form.end || null,
    capital: Number(form.capital),
    commissionBps: Number(form.commissionBps),
    slippageBps: Number(form.slippageBps),
    allowShort: form.allowShort,
  });

  const run = async () => {
    setBusy(true); setErr(null); setResult(null); setLeaderboard(null);
    try {
      if (form.strategyName === "ALL") {
        setLeaderboard(await api.runAll(body()));
      } else {
        setResult(await api.backtest(body()));
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const openRun = async (runId) => {
    setBusy(true); setErr(null);
    try { setResult(await api.getRun(runId)); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Backtest</h2>
        <div className="form-grid">
          <div>
            <label>Strategy</label>
            <select value={form.strategyName} onChange={(e) => upd("strategyName", e.target.value)} style={{ width: "100%" }}>
              <option value="ALL">▶ All enabled (leaderboard)</option>
              {strategies.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div><label>Symbols (blank = universe)</label><input style={{ width: "100%" }} placeholder="AAPL MSFT…" value={form.symbols} onChange={(e) => upd("symbols", e.target.value)} /></div>
          <div><label>Start date</label><input type="date" style={{ width: "100%" }} value={form.start} onChange={(e) => upd("start", e.target.value)} /></div>
          <div><label>End date</label><input type="date" style={{ width: "100%" }} value={form.end} onChange={(e) => upd("end", e.target.value)} /></div>
          <div><label>Capital</label><input type="number" style={{ width: "100%" }} value={form.capital} onChange={(e) => upd("capital", e.target.value)} /></div>
          <div><label>Commission bps</label><input type="number" style={{ width: "100%" }} value={form.commissionBps} onChange={(e) => upd("commissionBps", e.target.value)} /></div>
          <div><label>Slippage bps</label><input type="number" style={{ width: "100%" }} value={form.slippageBps} onChange={(e) => upd("slippageBps", e.target.value)} /></div>
          <div>
            <label>Allow short</label>
            <label className="toggle" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={form.allowShort} onChange={(e) => upd("allowShort", e.target.checked)} />
              <span className="slider" />
            </label>
          </div>
          <div><button disabled={busy} onClick={run} style={{ width: "100%" }}>{busy ? "Running…" : "Run backtest"}</button></div>
        </div>
        {err && <div className="neg" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {leaderboard && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Leaderboard <span className="muted">(ranked by Sharpe — click a row for the full report)</span></h3>
          <table>
            <thead>
              <tr><th>Strategy</th>{KPI_KEYS.map(([k, l]) => <th key={k}>{l}</th>)}</tr>
            </thead>
            <tbody>
              {leaderboard.map((e) => (
                <tr key={e.runId} className="row-click" onClick={() => openRun(e.runId)}>
                  <td style={{ fontWeight: 600 }}>{e.strategy}</td>
                  {KPI_KEYS.map(([k]) => <td key={k} className={cls(e.metrics?.[k])}>{fmt(e.metrics?.[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && <ReportView result={result} />}
    </div>
  );
}
