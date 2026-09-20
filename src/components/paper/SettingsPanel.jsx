import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { TIMEFRAMES } from "../../api/format";
import { ChipPicker } from "./ui";

const NUM_FIELDS = {
  intervalSeconds: "Interval",
  allocationUsd: "Allocation per strategy per symbol",
  positionSize: "Position size",
  lookbackBars: "Lookback bars",
  maxGrossUsd: "Max gross exposure",
  maxOrdersPerCycle: "Max orders per cycle",
  fillTimeoutSeconds: "Fill timeout",
};

// what the form edits; `enabled` is deliberately not here — Start / Stop job owns it
const toDraft = (s) => ({
  dryRun: s.dryRun, allowShort: s.allowShort, marketHoursOnly: s.marketHoursOnly, useRiskDefaults: s.useRiskDefaults,
  timeframeMode: s.timeframeMode, strategyNames: s.strategyNames || [], symbols: s.symbols || [],
  ...Object.fromEntries(Object.keys(NUM_FIELDS).map((k) => [k, String(s[k])])),
});

function summary(s) {
  return [
    `every ${humanInterval(s.intervalSeconds)}`,
    `$${Number(s.allocationUsd).toLocaleString("en-US")} per strategy per symbol`,
    s.timeframeMode === "AUTO" ? "each strategy's own timeframe" : s.timeframeMode,
    s.strategyNames.length ? `${s.strategyNames.length} strategies` : "all enabled strategies",
    s.symbols.length ? `${s.symbols.length} symbols` : "whole universe",
    s.allowShort ? "shorts allowed" : "long only",
    s.marketHoursOnly ? "market hours" : "any time",
  ].join(" · ");
}

function humanInterval(sec) {
  const n = Number(sec);
  if (!n || n < 0) return "";
  if (n < 120) return `${n} s`;
  if (n < 7200) return `${+(n / 60).toFixed(1)} min`;
  return `${+(n / 3600).toFixed(1)} h`;
}

/** Everything the job can be configured with. Saved with one button; the running job picks changes up at once. */
export default function SettingsPanel({ settings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [universe, setUniverse] = useState([]);
  const prevSaved = useRef(null);

  useEffect(() => {
    api.strategies().then((r) => setStrategies(r || [])).catch(() => {});
    api.universe().then((r) => setUniverse(r || [])).catch(() => {});
  }, []);

  const saved = useMemo(() => (settings ? JSON.stringify(toDraft(settings)) : null), [settings]);

  // adopt newly saved settings unless the user has unsaved edits
  useEffect(() => {
    if (!settings) return;
    const before = prevSaved.current;                   // read now: the updater below runs later
    prevSaved.current = saved;
    setDraft((d) => (d == null || JSON.stringify(d) === before ? toDraft(settings) : d));
  }, [saved]);                                          // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || !draft) return null;
  const dirty = JSON.stringify(draft) !== saved;
  const upd = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setSavedAt(null); };

  const save = async () => {
    const nums = {};
    for (const [k, label] of Object.entries(NUM_FIELDS)) {
      const raw = String(draft[k]).trim();
      const v = Number(raw);
      if (raw === "" || Number.isNaN(v)) { setErr(`${label} must be a number`); return; }
      nums[k] = v;
    }
    if (!draft.dryRun && settings.enabled &&
        !window.confirm("The job is running. Saving with dry run off makes the next cycle send real orders to your Alpaca paper account. Continue?")) return;
    setSaving(true); setErr(null);
    try {
      const fresh = await api.liveConfig();             // keep whatever was changed elsewhere (e.g. enabled)
      const result = await api.saveLiveConfig({ ...fresh, ...draft, ...nums });
      prevSaved.current = JSON.stringify(toDraft(result));
      setDraft(toDraft(result));
      setSavedAt(Date.now());
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  // the most the account could hold if every strategy were fully positioned in every symbol
  const nStrategies = draft.strategyNames.length || strategies.filter((x) => x.enabled).length;
  const nSymbols = draft.symbols.length || universe.length;
  const worstCase = nStrategies * nSymbols * (Number(draft.allocationUsd) || 0) * (Number(draft.positionSize) || 0);
  const cap = Number(draft.maxGrossUsd) || 0;
  const stratOptions = strategies.map((s) => ({ id: s.name, label: s.name, title: `${s.category || ""}${s.enabled ? "" : " · disabled"}` }));
  const symbolOptions = universe.map((x) => ({ id: x, label: x }));
  const frames = [{ id: "AUTO", label: "Auto — each strategy's own frame" }, ...TIMEFRAMES.filter((t) => t.id !== "NATIVE").map((t) => ({ id: t.id, label: t.label }))];
  const field = (k, label, help) => (
    <div>
      <label>{label}</label>
      <input style={{ width: "100%" }} inputMode="decimal" value={draft[k]} onChange={(e) => upd(k, e.target.value)} />
      {help && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{help}</div>}
    </div>
  );
  const check = (k, label, help) => (
    <label className="toggle-inline" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, textTransform: "none", letterSpacing: 0 }}>
      <input type="checkbox" checked={draft[k]} onChange={(e) => upd(k, e.target.checked)} style={{ marginTop: 3 }} />
      <span>{label}{help && <span className="muted" style={{ display: "block", fontSize: 11.5 }}>{help}</span>}</span>
    </label>
  );

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} Settings {dirty && <span className="pill warn">unsaved changes</span>}
          {!open && <span className="count"> · {summary(settings)}</span>}
        </h3>
        {open && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {savedAt && !dirty && <span className="pos" style={{ fontSize: 12.5 }}>Saved</span>}
            <button className="secondary xs" disabled={!dirty || saving} onClick={() => { setDraft(toDraft(settings)); setErr(null); }}>Reset</button>
            <button disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</button>
          </div>
        )}
      </div>
      {err && <div className="neg" style={{ marginTop: 8 }}>{err}</div>}

      {open && (
        <div className="settings-grid">
          <fieldset>
            <legend>Schedule</legend>
            {field("intervalSeconds", "Interval (seconds)", `A cycle every ${humanInterval(draft.intervalSeconds) || "…"}. Between 30 s and 24 h.`)}
            {check("marketHoursOnly", "Market hours only", "Skip cycles while the market is closed.")}
            {check("dryRun", "Dry run — send no orders", "Evaluate and plan, log what would be traded, change nothing. Untick to trade the paper account.")}
          </fieldset>

          <fieldset>
            <legend>Sizing and limits</legend>
            {field("allocationUsd", "Allocation ($ per strategy per symbol)", "What one strategy puts into one symbol at full signal. The account holds the net of all strategies, in whole shares.")}
            {field("positionSize", "Position size ×", "Multiplier on the allocation (0.1 – 5).")}
            {field("maxGrossUsd", "Max gross exposure ($)", "Orders that would take the account past this are held back; reducing orders are never blocked.")}
            {worstCase > 0 && (
              <div style={{ fontSize: 12, color: worstCase > cap ? "var(--amber)" : "var(--muted)" }}>
                {nStrategies} strateg{nStrategies === 1 ? "y" : "ies"} × {nSymbols} symbol{nSymbols === 1 ? "" : "s"} × ${Number(draft.allocationUsd).toLocaleString("en-US")} ={" "}
                <b>${Math.round(worstCase).toLocaleString("en-US")}</b> at most
                {worstCase > cap ? ` — above the $${cap.toLocaleString("en-US")} cap, so some orders would be held back when many strategies agree.` : " — within the cap."}
              </div>
            )}
            {field("maxOrdersPerCycle", "Max orders per cycle", "Safety cap; reducing orders go first.")}
            {check("allowShort", "Allow short positions", "Off: a short signal just means flat. Symbols that cannot be shorted are never shorted.")}
          </fieldset>

          <fieldset>
            <legend>Signals</legend>
            <div>
              <label>Timeframe</label>
              <select value={draft.timeframeMode} onChange={(e) => upd("timeframeMode", e.target.value)} style={{ width: "100%" }}>
                {frames.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {field("lookbackBars", "Lookback (bars)", "History each strategy is evaluated on (50 – 2000).")}
            {check("useRiskDefaults", "Use each strategy's stop-loss / take-profit", "The saved defaults; a stopped-out position stays closed until the signal changes.")}
            {field("fillTimeoutSeconds", "Order fill timeout (seconds)", "An order not filled in time is cancelled.")}
          </fieldset>

          <fieldset className="wide">
            <legend>Strategies</legend>
            <ChipPicker options={stratOptions} value={draft.strategyNames} onChange={(v) => upd("strategyNames", v)}
                        emptyHint="None picked — every enabled strategy runs." />
          </fieldset>
          <fieldset className="wide">
            <legend>Symbols</legend>
            <ChipPicker options={symbolOptions} value={draft.symbols} onChange={(v) => upd("symbols", v)}
                        emptyHint="None picked — the whole Universe is traded." />
          </fieldset>
        </div>
      )}
    </div>
  );
}
