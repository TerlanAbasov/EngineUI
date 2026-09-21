import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { ChipPicker } from "../paper/ui";

const toDraft = (s) => ({
  quantity: String(s.quantity), orderType: s.orderType, tif: s.tif, maxCommandsPerRun: String(s.maxCommandsPerRun),
  strategyNames: s.strategyNames || [], symbols: s.symbols || [],
});

const summary = (s) => [
  `${s.quantity} share${s.quantity === 1 ? "" : "s"} per command`,
  `${s.orderType} · ${s.tif}`,
  s.strategyNames.length ? `${s.strategyNames.length} strategies` : "all enabled strategies",
  s.symbols.length ? `${s.symbols.length} symbols` : "whole universe",
  `max ${s.maxCommandsPerRun} per run`,
].join(" · ");

/** What may be sent: how much, how, and for which strategies and symbols. Saved with one button; the running job uses it from the next command. */
export default function AutoTradeSettings({ settings, onSaved }) {
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
    const before = prevSaved.current;
    prevSaved.current = saved;
    setDraft((d) => (d == null || JSON.stringify(d) === before ? toDraft(settings) : d));
  }, [saved]);                                          // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || !draft) return null;
  const dirty = JSON.stringify(draft) !== saved;
  const upd = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setSavedAt(null); };

  const save = async () => {
    const quantity = Number(String(draft.quantity).trim());
    const maxCommandsPerRun = Number(String(draft.maxCommandsPerRun).trim());
    if (!(quantity > 0)) { setErr("Quantity must be a number above 0"); return; }
    if (!Number.isInteger(maxCommandsPerRun) || maxCommandsPerRun < 1) { setErr("Max commands per run must be a whole number, at least 1"); return; }
    if (settings.enabled && !window.confirm("Auto trading is on. These settings apply to the very next command. Save?")) return;
    setSaving(true); setErr(null);
    try {
      const result = await api.saveAutoTradeSettings({
        quantity, orderType: draft.orderType, tif: draft.tif, maxCommandsPerRun, strategyNames: draft.strategyNames, symbols: draft.symbols,
      });
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

  const stratOptions = strategies.map((s) => ({ id: s.name, label: s.name, title: `${s.category || ""}${s.enabled ? "" : " · disabled"}` }));
  const symbolOptions = universe.map((x) => ({ id: x, label: x }));

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
            <legend>Order</legend>
            <div>
              <label>Quantity (shares per command)</label>
              <input style={{ width: "100%" }} inputMode="decimal" value={draft.quantity} onChange={(e) => upd("quantity", e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Every BUY or SELL is for this many shares, whatever the strategy or symbol.</div>
            </div>
            <div>
              <label>Order type</label>
              <select style={{ width: "100%" }} value={draft.orderType} onChange={(e) => upd("orderType", e.target.value)}>
                <option value="MKT">Market</option>
                <option value="LMT">Limit at the signal bar's close</option>
              </select>
            </div>
            <div>
              <label>Time in force</label>
              <select style={{ width: "100%" }} value={draft.tif} onChange={(e) => upd("tif", e.target.value)}>
                <option value="DAY">Day</option>
                <option value="GTC">Good till cancelled</option>
              </select>
            </div>
          </fieldset>

          <fieldset>
            <legend>Safety</legend>
            <div>
              <label>Max commands per run</label>
              <input style={{ width: "100%" }} inputMode="numeric" value={draft.maxCommandsPerRun} onChange={(e) => upd("maxCommandsPerRun", e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                If more strategies than this turn at the same bar close, the rest are held back and shown as SKIPPED. They are not sent later.
              </div>
            </div>
          </fieldset>

          <fieldset className="wide">
            <legend>Strategies</legend>
            <ChipPicker options={stratOptions} value={draft.strategyNames} onChange={(v) => upd("strategyNames", v)}
                        emptyHint="None picked — every enabled strategy is watched, each on its own timeframe." />
          </fieldset>
          <fieldset className="wide">
            <legend>Symbols</legend>
            <ChipPicker options={symbolOptions} value={draft.symbols} onChange={(v) => upd("symbols", v)}
                        emptyHint="None picked — the whole Universe is watched." />
          </fieldset>
        </div>
      )}
    </div>
  );
}
