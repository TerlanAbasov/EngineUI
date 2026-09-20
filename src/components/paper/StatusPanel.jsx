import { useState } from "react";
import { api } from "../../api/client";
import { fmt, cls, fmtMoney, fmtAgo } from "../../api/format";
import { useNow } from "../../hooks/useNow";
import { StatusPill } from "./ui";

function stateOf(s) {
  if (!s.enabled) return { label: "OFF", tone: "neutral", hint: "The job is not running. Nothing is evaluated or sent." };
  if (s.dryRun) return { label: "DRY RUN", tone: "warn", hint: "The job runs, but sends no orders and changes no positions." };
  return { label: "SENDING ORDERS", tone: "good", hint: "The job runs and sends orders to your Alpaca paper account." };
}

/** Job state, the Alpaca account, the last cycle, and the actions: start / stop, run now, flatten. */
export default function StatusPanel({ status, error, onChanged }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  if (!status) {
    return <div className="panel">{error ? <span className="neg">Could not load the paper-trading status: {error}</span> : <span className="muted">Loading…</span>}</div>;
  }
  const s = status.settings;
  const st = stateOf(s);
  const b = status.broker || {};
  const last = status.lastCycle;
  const problems = [];
  if (!status.credentialsConfigured) problems.push("Alpaca credentials are not configured (decision.alpaca.api-key-id / api-secret-key).");
  if (!status.paperEndpoint) problems.push("The trading endpoint is not Alpaca's paper endpoint — the job refuses to trade.");
  if (status.credentialsConfigured && status.paperEndpoint && !b.reachable) problems.push(`Alpaca: ${b.error || "unreachable"}`);

  const act = async (name, fn, okText) => {
    setBusy(name); setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ type: "ok", text: okText });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const toggle = () => {
    const turningOn = !s.enabled;
    if (turningOn && !s.dryRun &&
        !window.confirm(`Start the job? Every ${s.intervalSeconds} s it will evaluate the strategies and send real orders to your Alpaca PAPER account${s.marketHoursOnly ? " while the market is open" : ""}.`)) return;
    act("toggle", async () => {
      const fresh = await api.liveConfig();               // never overwrite a setting changed elsewhere
      await api.saveLiveConfig({ ...fresh, enabled: turningOn });
    }, turningOn ? "Job started." : "Job stopped. Open positions are left as they are — use Flatten to close them.");
  };

  const flatten = () => {
    if (!window.confirm("Stop the job and close every position it holds in the Alpaca paper account? "
      + "Each strategy's virtual position is closed at the fill price.")) return;
    act("flatten", () => api.liveFlatten(), "Closing positions in the background — watch the Cycles tab.");
  };

  return (
    <div className="panel">
      <div className="paper-head">
        <div>
          <h2 style={{ margin: 0 }}>Paper trading <span className="pill neutral" title="Orders go to Alpaca's paper (demo) account only">PAPER</span></h2>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            Checks every strategy on every symbol on a schedule and trades the net position in your Alpaca demo account,
            so each strategy's real-time result can be measured.
          </div>
        </div>
        <div className="paper-actions">
          <span className={`pill ${st.tone} big`} title={st.hint}>{st.label}</span>
          <button onClick={toggle} disabled={busy != null}>{busy === "toggle" ? "…" : s.enabled ? "Stop job" : "Start job"}</button>
          <button className="secondary" onClick={() => act("run", () => api.liveRunNow(), "Cycle started.")}
                  disabled={busy != null || status.cycleRunning}
                  title="Run one cycle now with the saved settings (also when the job is stopped)">
            {status.cycleRunning ? "Cycle running…" : "Run now"}
          </button>
          <button className="secondary danger" onClick={flatten} disabled={busy != null || status.cycleRunning}
                  title="Stop the job and close every position it holds">Flatten…</button>
        </div>
      </div>

      {problems.map((p) => <div key={p} className="job-warn">{p}</div>)}
      {msg && <div className={msg.type === "error" ? "neg" : "muted"} style={{ marginTop: 8, fontSize: 13 }}>{msg.text}</div>}
      {error && <div className="job-warn">Status not refreshing: {error}</div>}
      {s.enabled && s.dryRun && <div className="job-warn">Dry run: cycles are evaluated and orders are planned, but nothing is sent. Untick "Dry run" in Settings to trade.</div>}

      <div className="stat-grid">
        <div className="stat"><div className="k">Account equity</div><div className="v">{b.equity != null ? fmtMoney(b.equity) : "—"}</div></div>
        <div className="stat"><div className="k">Cash</div><div className="v">{b.cash != null ? fmtMoney(b.cash) : "—"}</div></div>
        <div className="stat"><div className="k">Buying power</div><div className="v">{b.buyingPower != null ? fmtMoney(b.buyingPower) : "—"}</div></div>
        <div className="stat"><div className="k">Market</div>
          <div className={`v ${b.marketOpen ? "pos" : ""}`}>{b.marketOpen == null ? "—" : b.marketOpen ? "open" : "closed"}</div>
          {b.marketOpen === false && b.nextOpen && <div className="sub">opens {fmtAgo(b.nextOpen, now)}</div>}
        </div>
        <div className="stat"><div className="k">Next cycle</div>
          <div className="v">{status.cycleRunning ? "running…" : s.enabled && status.nextRun ? fmtAgo(status.nextRun, now) : "—"}</div>
          <div className="sub">every {s.intervalSeconds} s</div>
        </div>
        <div className="stat"><div className="k">Open positions</div><div className="v">{status.openSlots}</div><div className="sub">strategy × symbol</div></div>
        <div className="stat"><div className="k">Realized P&amp;L</div><div className={`v ${cls(status.realizedPnl)}`}>{fmtMoney(status.realizedPnl)}</div></div>
        <div className="stat"><div className="k">Unrealized P&amp;L</div><div className={`v ${cls(status.unrealizedPnl)}`}>{fmtMoney(status.unrealizedPnl)}</div>
          <div className="sub">total <span className={cls(status.realizedPnl + status.unrealizedPnl)}>{fmt(status.realizedPnl + status.unrealizedPnl)}</span></div>
        </div>
      </div>

      <div className="last-cycle">
        <span className="muted">Last cycle</span>{" "}
        {last ? (
          <>
            <StatusPill value={last.status} /> <span className="muted">{fmtAgo(last.startedAt, now)}{last.mode === "FLATTEN" ? " · flatten" : ""}{last.dryRun ? " · dry run" : ""}</span>{" "}
            <span title={last.message}>{last.message}</span>
          </>
        ) : <span className="muted">none yet — press Run now to try one.</span>}
      </div>
    </div>
  );
}
