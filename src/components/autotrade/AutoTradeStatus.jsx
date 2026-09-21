import { useState } from "react";
import { api } from "../../api/client";
import { fmtAgo, fmtDateTime } from "../../api/format";
import { useNow } from "../../hooks/useNow";

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The on/off switch for sending signals to ExecutionEngine, with what the job did on its last run. */
export default function AutoTradeStatus({ status, error, onChanged }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!status) {
    return <div className="panel">{error ? <span className="neg">Could not load the auto-trading status: {error}</span> : <span className="muted">Loading…</span>}</div>;
  }
  const s = status.settings;
  const last = status.lastRun;
  const blocked = !s.enabled && !status.configured;

  const change = async (action, okText) => {
    setBusy(true); setMsg(null);
    try {
      await action();
      setMsg({ type: "ok", text: okText });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const toggle = () => {
    if (s.enabled) {
      change(api.disableAutoTrade, "Stopped. Nothing more is sent; commands already sent are not undone.");
      return;
    }
    const strategies = s.strategyNames.length ? `${s.strategyNames.length} chosen ${s.strategyNames.length === 1 ? "strategy" : "strategies"}` : "every enabled strategy";
    const symbols = s.symbols.length ? plural(s.symbols.length, "chosen symbol") : "the whole Universe";
    const scope = `${strategies} on ${symbols}`;
    if (!window.confirm(
      `Start auto trading?\n\nFrom now on, whenever a strategy turns LONG or SHORT on a bar that has just completed, ExecutionEngine is sent a `
      + `BUY or SELL of ${s.quantity} share${s.quantity === 1 ? "" : "s"} (${s.orderType}, ${s.tif}).\n\nWatching: ${scope}.\n`
      + `Bars that completed before now are ignored, and a strategy going flat sends nothing.`)) return;
    change(api.enableAutoTrade, "Started. Only bars that complete from now on can trigger a command.");
  };

  const trouble = last ? last.rejected + last.failed : 0;

  return (
    <div className="panel">
      <div className="paper-head">
        <div>
          <h2 style={{ margin: 0 }}>Auto trading <span className="pill neutral" title="Commands go to ExecutionEngine's TradeController">→ ExecutionEngine</span></h2>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: 720 }}>
            Watches every strategy on every Universe symbol in the strategy's own timeframe. When one turns LONG or SHORT on a bar that has just
            completed, it sends ExecutionEngine a BUY or SELL. Each bar sends at most one command per strategy and symbol, and nothing is retried.
          </div>
        </div>
        <div className="paper-actions">
          <span className={`pill ${s.enabled ? "good" : "neutral"} big`}
                title={s.enabled ? "Signals are being sent to ExecutionEngine." : "Nothing is evaluated or sent."}>{s.enabled ? "ON" : "OFF"}</span>
          <button onClick={toggle} disabled={busy || blocked}
                  title={blocked ? "ExecutionEngine is not configured" : undefined}>
            {busy ? "…" : s.enabled ? "Stop auto trading" : "Start auto trading"}
          </button>
        </div>
      </div>

      {!status.configured && (
        <div className="job-warn">ExecutionEngine is not configured, so nothing can be sent. Set <code>decision.execution-engine.url</code> (env <code>EXECUTION_ENGINE_URL</code>) on the backend and restart it.</div>
      )}
      {msg && <div className={msg.type === "error" ? "neg" : "muted"} style={{ marginTop: 8, fontSize: 13 }}>{msg.text}</div>}
      {error && <div className="job-warn">Status not refreshing: {error}</div>}

      <div className="stat-grid">
        <div className="stat"><div className="k">State</div>
          <div className={`v ${s.enabled ? "pos" : ""}`}>{s.enabled ? (status.running ? "checking…" : "watching") : "off"}</div>
          {s.enabled && s.enabledSince && <div className="sub">since {fmtDateTime(s.enabledSince)}</div>}
        </div>
        <div className="stat"><div className="k">Looks for new bars</div><div className="v">every {status.checkEverySeconds} s</div>
          <div className="sub">each timeframe only when its bar is due</div>
        </div>
        <div className="stat"><div className="k">Last activity</div><div className="v">{last ? fmtAgo(last.at, now) : "—"}</div>
          {last && <div className="sub">{plural(last.checked, "symbol/timeframe")} checked</div>}
        </div>
        <div className="stat"><div className="k">Signals found</div><div className="v">{last ? last.flips : "—"}</div><div className="sub">last activity</div></div>
        <div className="stat"><div className="k">Sent</div><div className={`v ${last && last.sent > 0 ? "pos" : ""}`}>{last ? last.sent : "—"}</div>
          {last && last.skipped > 0 && <div className="sub">{last.skipped} held back (over the limit)</div>}
        </div>
        <div className="stat"><div className="k">Refused / no answer</div><div className={`v ${trouble > 0 ? "neg" : ""}`}>{last ? trouble : "—"}</div>
          {last && <div className="sub">{last.rejected} refused · {last.failed} no answer</div>}
        </div>
      </div>
      {last && last.errors > 0 && (
        <div className="job-warn">{plural(last.errors, "check")} could not be evaluated (market data or a strategy failed) — see the backend log.</div>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        A strategy that goes flat sends nothing: ExecutionEngine has no per-symbol close command, so exits are ExecutionEngine's to manage.
      </div>
    </div>
  );
}
