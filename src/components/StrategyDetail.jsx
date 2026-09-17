import { useState } from "react";
import { api } from "../api/client";
import { fmt, cls, TIMEFRAMES } from "../api/format";

const DIRECTIONS = ["", "long_only", "short_only", "long_short"];
const METRICS = [
  ["sharpe", "Sharpe"], ["calmar", "Calmar"], ["sortino", "Sortino"],
  ["totalReturnPct", "Total Return %"], ["cagrPct", "CAGR %"], ["profitFactor", "Profit Factor"],
];

export default function StrategyDetail({ strat, onSaved }) {
  const keys = Object.keys(strat.defaultParams || {});
  const [params, setParams] = useState({ ...strat.params });
  const [ctl, setCtl] = useState({
    weight: strat.weight ?? 1,
    invert: !!strat.invert,
    directionOverride: strat.directionOverride || "",
    tags: (strat.tags || []).join(", "),
    notes: strat.notes || "",
    recommendedTimeframe: strat.recommendedTimeframe || "H1",
    intraday: strat.intraday !== false,
    defaultStopLossPct: strat.defaultStopLossPct ?? "",
    defaultTakeProfitPct: strat.defaultTakeProfitPct ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // optimizer
  const [opt, setOpt] = useState({
    param1: keys[0] || "", from1: "", to1: "", step1: "",
    param2: "", from2: "", to2: "", step2: "",
    metric: "sharpe", timeframe: strat.recommendedTimeframe || "H1", symbols: "", start: "", end: "",
  });
  const [optRes, setOptRes] = useState(null);
  const [optBusy, setOptBusy] = useState(false);

  // risk-default sweep (timeframe x stop-loss% x take-profit%)
  const [riskForm, setRiskForm] = useState({ symbols: "", start: "", end: "" });
  const [riskRes, setRiskRes] = useState(null);
  const [riskBusy, setRiskBusy] = useState(false);

  const dirty =
    keys.some((k) => Number(params[k]) !== Number(strat.params[k])) ||
    Number(ctl.weight) !== (strat.weight ?? 1) ||
    ctl.invert !== !!strat.invert ||
    ctl.directionOverride !== (strat.directionOverride || "") ||
    ctl.tags !== (strat.tags || []).join(", ") ||
    ctl.notes !== (strat.notes || "") ||
    ctl.recommendedTimeframe !== (strat.recommendedTimeframe || "H1") ||
    ctl.intraday !== (strat.intraday !== false) ||
    String(ctl.defaultStopLossPct) !== String(strat.defaultStopLossPct ?? "") ||
    String(ctl.defaultTakeProfitPct) !== String(strat.defaultTakeProfitPct ?? "");

  const flash = (m) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 2500); };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const nums = {};
      keys.forEach((k) => { nums[k] = Number(params[k]); });
      let updated = await api.setStrategyParams(strat.name, nums);
      updated = await api.setStrategyControls(strat.name, {
        weight: Number(ctl.weight),
        invert: ctl.invert,
        directionOverride: ctl.directionOverride,
        tags: ctl.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: ctl.notes,
        recommendedTimeframe: ctl.recommendedTimeframe,
        intraday: ctl.intraday,
        defaultStopLossPct: ctl.defaultStopLossPct === "" ? null : Number(ctl.defaultStopLossPct),
        defaultTakeProfitPct: ctl.defaultTakeProfitPct === "" ? null : Number(ctl.defaultTakeProfitPct),
      });
      onSaved(updated);
      flash("Saved.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const resetParams = async () => {
    setBusy(true); setErr(null);
    try {
      const updated = await api.resetStrategyParams(strat.name);
      setParams({ ...updated.params });
      onSaved(updated);
      flash("Parameters reset to defaults.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const runOptimize = async () => {
    setOptBusy(true); setErr(null); setOptRes(null);
    try {
      const body = {
        symbols: opt.symbols.trim() ? opt.symbols.split(/[,\s]+/).map((s) => s.toUpperCase()).filter(Boolean) : null,
        start: opt.start || null, end: opt.end || null,
        timeframe: opt.timeframe, metric: opt.metric,
        param1: opt.param1, from1: Number(opt.from1), to1: Number(opt.to1), step1: Number(opt.step1),
        param2: opt.param2 || null,
        from2: opt.param2 ? Number(opt.from2) : null,
        to2: opt.param2 ? Number(opt.to2) : null,
        step2: opt.param2 ? Number(opt.step2) : null,
      };
      setOptRes(await api.optimizeStrategy(strat.name, body));
    } catch (e) { setErr(e.message); } finally { setOptBusy(false); }
  };

  const applyBest = async () => {
    if (!optRes?.bestParams) return;
    setBusy(true); setErr(null);
    try {
      const updated = await api.setStrategyParams(strat.name, optRes.bestParams);
      setParams({ ...updated.params });
      onSaved(updated);
      flash("Best parameters applied.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const runRiskOptimize = async () => {
    setRiskBusy(true); setErr(null); setRiskRes(null);
    try {
      const body = {
        symbols: riskForm.symbols.trim()
          ? riskForm.symbols.split(/[,\s]+/).map((s) => s.toUpperCase()).filter(Boolean) : null,
        start: riskForm.start || null, end: riskForm.end || null,
      };
      setRiskRes(await api.optimizeRiskDefaults(strat.name, body));
    } catch (e) { setErr(e.message); } finally { setRiskBusy(false); }
  };

  const applyRisk = async () => {
    if (!riskRes?.best) return;
    setBusy(true); setErr(null);
    try {
      const { timeframe, stopLossPct, takeProfitPct } = riskRes.best;
      const updated = await api.setStrategyControls(strat.name, {
        recommendedTimeframe: timeframe, defaultStopLossPct: stopLossPct, defaultTakeProfitPct: takeProfitPct,
      });
      setCtl((c) => ({ ...c, recommendedTimeframe: timeframe,
        defaultStopLossPct: stopLossPct, defaultTakeProfitPct: takeProfitPct }));
      onSaved(updated);
      flash("Risk defaults applied.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = { padding: "2px 6px" };

  return (
    <div style={{ padding: "12px 4px", display: "grid", gap: 16 }}>
      {err && <div className="neg">{err}</div>}
      {msg && <div className="pos">{msg}</div>}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Parameters */}
        <div style={{ flex: "1 1 280px" }}>
          <h4 style={{ margin: "0 0 6px" }}>Parameters</h4>
          {keys.length === 0 && <div className="muted">No tunable parameters.</div>}
          {keys.map((k) => {
            const overridden = Number(strat.params[k]) !== Number(strat.defaultParams[k]);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <label style={{ width: 90, textTransform: "capitalize" }}>{k}</label>
                <input type="number" step="any" style={{ flex: 1 }} value={params[k] ?? ""}
                       onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))} />
                <span className="muted" style={{ fontSize: 11, width: 70 }}>
                  {overridden ? `def ${fmt(strat.defaultParams[k], 4)}` : "default"}
                </span>
              </div>
            );
          })}
          {keys.length > 0 && (
            <button className="secondary" disabled={busy} onClick={resetParams} style={{ marginTop: 4 }}>
              Reset to defaults
            </button>
          )}
        </div>

        {/* Controls */}
        <div style={{ flex: "1 1 280px" }}>
          <h4 style={{ margin: "0 0 6px" }}>Controls</h4>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Ensemble weight</span>
              <input type="number" step="0.25" min="0" style={{ width: 100 }} value={ctl.weight}
                     onChange={(e) => setCtl((c) => ({ ...c, weight: e.target.value }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Contrarian (invert)</span>
              <input type="checkbox" checked={ctl.invert}
                     onChange={(e) => setCtl((c) => ({ ...c, invert: e.target.checked }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Direction override</span>
              <select value={ctl.directionOverride}
                      onChange={(e) => setCtl((c) => ({ ...c, directionOverride: e.target.value }))}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d || `native (${strat.nativeDirection})`}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Recommended TF</span>
              <select value={ctl.recommendedTimeframe}
                      onChange={(e) => setCtl((c) => ({ ...c, recommendedTimeframe: e.target.value }))}>
                {TIMEFRAMES.filter((t) => t.id !== "NATIVE").map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Default stop-loss %</span>
              <input type="number" step="any" min="0" style={{ width: 100 }} placeholder="none"
                     value={ctl.defaultStopLossPct}
                     onChange={(e) => setCtl((c) => ({ ...c, defaultStopLossPct: e.target.value }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Default take-profit %</span>
              <input type="number" step="any" min="0" style={{ width: 100 }} placeholder="none"
                     value={ctl.defaultTakeProfitPct}
                     onChange={(e) => setCtl((c) => ({ ...c, defaultTakeProfitPct: e.target.value }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Intraday (day-trading)</span>
              <input type="checkbox" checked={ctl.intraday}
                     onChange={(e) => setCtl((c) => ({ ...c, intraday: e.target.checked }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 120 }}>Tags</span>
              <input style={{ flex: 1 }} placeholder="core, intraday" value={ctl.tags}
                     onChange={(e) => setCtl((c) => ({ ...c, tags: e.target.value }))} />
            </label>
            <label style={{ display: "flex", gap: 8 }}>
              <span style={{ width: 120 }}>Notes</span>
              <textarea rows={2} style={{ flex: 1 }} value={ctl.notes}
                        onChange={(e) => setCtl((c) => ({ ...c, notes: e.target.value }))} />
            </label>
          </div>
        </div>
      </div>

      <div>
        <button disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
      </div>

      {/* Optimizer */}
      <div style={{ borderTop: "1px solid #2a3441", paddingTop: 12 }}>
        <h4 style={{ margin: "0 0 8px" }}>Parameter sweep <span className="muted">— grid-search one or two params</span></h4>
        {keys.length === 0 ? (
          <div className="muted">Nothing to sweep.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
              <SweepAxis label="Param 1" pick={opt.param1} keys={keys}
                         onPick={(v) => setOpt((o) => ({ ...o, param1: v }))}
                         from={opt.from1} to={opt.to1} step={opt.step1}
                         set={(f, t, s) => setOpt((o) => ({ ...o, from1: f, to1: t, step1: s }))} />
              <SweepAxis label="Param 2 (opt.)" pick={opt.param2} keys={["", ...keys]}
                         onPick={(v) => setOpt((o) => ({ ...o, param2: v }))}
                         from={opt.from2} to={opt.to2} step={opt.step2}
                         set={(f, t, s) => setOpt((o) => ({ ...o, from2: f, to2: t, step2: s }))} />
              <div>
                <label>Score by</label>
                <select value={opt.metric} onChange={(e) => setOpt((o) => ({ ...o, metric: e.target.value }))}>
                  {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label>Timeframe</label>
                <select value={opt.timeframe} onChange={(e) => setOpt((o) => ({ ...o, timeframe: e.target.value }))}>
                  {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label>Symbols (blank = universe)</label>
                <input value={opt.symbols} placeholder="AAPL MSFT"
                       onChange={(e) => setOpt((o) => ({ ...o, symbols: e.target.value }))} />
              </div>
              <button disabled={optBusy} onClick={runOptimize}>{optBusy ? "Sweeping…" : "Run sweep"}</button>
            </div>

            {optRes && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                  <b>Best:</b>
                  <code>{Object.entries(optRes.bestParams).map(([k, v]) => `${k}=${fmt(v, 4)}`).join("  ")}</code>
                  <span className={cls(optRes.best?.score)}>{optRes.metric} {fmt(optRes.best?.score)}</span>
                  <button className="secondary" disabled={busy} onClick={applyBest}>Apply best</button>
                </div>
                <div style={{ maxHeight: 240, overflow: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(optRes.grid[0]?.params || {}).map((k) => <th key={k} style={cell}>{k}</th>)}
                        <th style={cell}>{optRes.metric}</th>
                        <th style={cell}>Return %</th><th style={cell}>Max DD %</th><th style={cell}>Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optRes.grid.slice(0, 30).map((c, i) => (
                        <tr key={i} className={i === 0 ? "pos" : ""}>
                          {Object.values(c.params).map((v, j) => <td key={j} style={cell}>{fmt(v, 4)}</td>)}
                          <td style={cell} className={cls(c.score)}>{fmt(c.score)}</td>
                          <td style={cell} className={cls(c.metrics?.totalReturnPct)}>{fmt(c.metrics?.totalReturnPct)}</td>
                          <td style={cell} className="neg">{fmt(c.metrics?.maxDrawdownPct)}</td>
                          <td style={cell}>{fmt(c.metrics?.trades, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Risk-default sweep */}
      <div style={{ borderTop: "1px solid #2a3441", paddingTop: 12 }}>
        <h4 style={{ margin: "0 0 8px" }}>
          Risk defaults <span className="muted">— best timeframe / stop-loss% / take-profit%</span>
        </h4>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label>Symbols (blank = universe)</label>
            <input value={riskForm.symbols} placeholder="AAPL MSFT"
                   onChange={(e) => setRiskForm((f) => ({ ...f, symbols: e.target.value }))} />
          </div>
          <div>
            <label>Start</label>
            <input type="date" value={riskForm.start}
                   onChange={(e) => setRiskForm((f) => ({ ...f, start: e.target.value }))} />
          </div>
          <div>
            <label>End</label>
            <input type="date" value={riskForm.end}
                   onChange={(e) => setRiskForm((f) => ({ ...f, end: e.target.value }))} />
          </div>
          <button disabled={riskBusy} onClick={runRiskOptimize}>
            {riskBusy ? "Sweeping…" : "Find best timeframe/SL/TP"}
          </button>
        </div>
        {riskRes && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <code>
                tf={riskRes.best?.timeframe} SL={fmt(riskRes.best?.stopLossPct, 1)}% TP={fmt(riskRes.best?.takeProfitPct, 1)}%
              </code>
              <span className="muted" style={{ fontSize: 11 }}>
                (picked on the first {Math.round(riskRes.trainFraction * 100)}% of the window, {riskRes.cellsEvaluated} combos)
              </span>
              <button className="secondary" disabled={busy} onClick={applyRisk}>Apply</button>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              <div>
                <span className="muted" style={{ fontSize: 11 }}>Train (in-sample): </span>
                <span className={cls(riskRes.best?.score)}>{riskRes.metric} {fmt(riskRes.best?.score)}</span>
              </div>
              <div>
                <span className="muted" style={{ fontSize: 11 }}>Test (unseen holdout): </span>
                <span className={cls(riskRes.outOfSample?.score)}>{riskRes.metric} {fmt(riskRes.outOfSample?.score)}</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
              The train number is what the sweep optimized for — expect it to look better than
              test. A test number close to (or negative vs.) train means this combo doesn't hold
              up out of sample; a wide gap is a sign to distrust it rather than a strategy to chase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SweepAxis({ label, pick, keys, onPick, from, to, step, set }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
      <div>
        <label>{label}</label>
        <select value={pick} onChange={(e) => onPick(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{k || "—"}</option>)}
        </select>
      </div>
      <div><label>from</label><input type="number" step="any" style={{ width: 64 }} value={from} onChange={(e) => set(e.target.value, to, step)} /></div>
      <div><label>to</label><input type="number" step="any" style={{ width: 64 }} value={to} onChange={(e) => set(from, e.target.value, step)} /></div>
      <div><label>step</label><input type="number" step="any" style={{ width: 56 }} value={step} onChange={(e) => set(from, to, e.target.value)} /></div>
    </div>
  );
}
