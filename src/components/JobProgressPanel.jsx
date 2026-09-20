import { useEffect, useRef, useState } from "react";
import { fmtDuration } from "../api/format";

const KIND_LABEL = { RUN: "Backtest", RUN_ALL: "Leaderboard run", PAIRS: "Pairs backtest", ENSEMBLE: "Ensemble" };
const MAX_RUNNING_SHOWN = 6;

/** Server elapsed time, kept ticking between polls without trusting the browser clock against the server's. */
function useElapsed(job) {
  const base = useRef({ ms: job.elapsedMs, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => { base.current = { ms: job.elapsedMs, at: Date.now() }; }, [job]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  return base.current.ms + (Date.now() - base.current.at);
}

function Bar({ pct, label, thin }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={`jbar${thin ? " thin" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100}
         aria-valuenow={Math.round(v)} aria-label={label}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

const stepIcon = (state) => (state === "done" ? "✓" : state === "active" ? <span className="jspin" /> : "○");

function symbolClass(s) {
  if (s.state === "nodata") return "nodata";
  if (s.state === "pending") return "pending";
  return s.total > 0 && s.done < s.total ? "active" : "done";
}

/**
 * What a running backtest is doing: overall progress, its steps (each with its own counter), and the
 * symbols and strategies taking part. Purely presentational — the numbers come from the backend job.
 */
export default function JobProgressPanel({ job, linkLost, onCancel }) {
  const elapsed = useElapsed(job);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState(null);
  const cancelRequested = cancelling || job.cancelRequested;

  const strategies = job.strategies || [];
  const symbols = job.symbols || [];
  const count = (st) => strategies.filter((x) => x.state === st).length;
  const running = job.running || [];

  const doCancel = async () => {
    setCancelling(true); setCancelErr(null);
    try { await onCancel(); } catch (e) { setCancelErr(e.message); setCancelling(false); }
  };

  return (
    <div className="panel job-panel" aria-live="polite">
      <div className="job-head">
        <div>
          <h3 style={{ margin: 0 }}>
            <span className="jspin big" /> {KIND_LABEL[job.kind] || "Backtest"} in progress
            <span className="count"> · {job.title}</span>
          </h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            You can leave this page — the backtest keeps running, and its result will be here when you come back.
          </div>
        </div>
        <div className="job-head-right">
          <span className="job-elapsed" title="Time since the backtest started">{fmtDuration(elapsed)}</span>
          <button className="secondary xs" disabled={cancelRequested} onClick={doCancel}
                  title="Stop at the next safe point; nothing from this run is saved">
            {cancelRequested ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      </div>

      {linkLost && (
        <div className="job-warn">Can't reach the backend right now — retrying. The backtest keeps running there.</div>
      )}
      {cancelErr && <div className="neg" style={{ fontSize: 12, marginTop: 6 }}>Could not cancel: {cancelErr}</div>}

      <div className="job-overall">
        <Bar pct={job.percent} label="Overall progress" />
        <span className="job-pct">{job.percent}%</span>
      </div>

      <div className="job-steps">
        {(job.steps || []).map((s) => (
          <div key={s.key} className={`job-step ${s.state}`}>
            <span className="job-step-icon">{stepIcon(s.state)}</span>
            <span className="job-step-label">{s.label}</span>
            {s.total > 1 ? (
              <>
                <Bar thin pct={s.total ? (100 * s.done) / s.total : 0} label={s.label} />
                <span className="job-step-count">{s.done}/{s.total}</span>
              </>
            ) : <><span /><span /></>}
            <span className="job-step-detail muted">{s.state === "pending" ? "" : s.detail || ""}</span>
          </div>
        ))}
      </div>

      {symbols.length > 0 && (
        <div className="job-section">
          <div className="job-section-title">Symbols <span className="count">
            · {symbols.filter((x) => x.state === "done").length} loaded of {symbols.length}
            {symbols.some((x) => x.state === "nodata") && `, ${symbols.filter((x) => x.state === "nodata").length} without data`}
          </span></div>
          <div className="chip-row">
            {symbols.map((s) => (
              <span key={s.name} className={`jchip ${symbolClass(s)}`}
                    title={s.state === "nodata" ? "No cached bars for this symbol — it is skipped"
                      : s.state === "pending" ? "Waiting to be loaded"
                        : s.total > 0 ? `${s.done} of ${s.total} strategies computed` : "Bars loaded"}>
                {s.name}{s.state === "done" && s.total > 0 ? <em> {s.done}/{s.total}</em> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {strategies.length > 1 && (
        <div className="job-section">
          <div className="job-section-title">Strategies <span className="count">
            · {count("done")} done · {count("running")} running
            {count("failed") > 0 && ` · ${count("failed")} failed`} · {count("pending")} waiting
            {" "}of {strategies.length}
          </span></div>
          <div className="chip-row job-strategies">
            {strategies.map((s) => (
              <span key={s.name} className={`jchip small ${s.state}`}
                    title={`${s.name} — ${s.state === "pending" ? "waiting" : s.state}`}>{s.name}</span>
            ))}
          </div>
          {running.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Running now: {running.slice(0, MAX_RUNNING_SHOWN).join(", ")}
              {running.length > MAX_RUNNING_SHOWN && ` … +${running.length - MAX_RUNNING_SHOWN} more`}
            </div>
          )}
        </div>
      )}
      {strategies.length === 1 && running.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Strategy: {strategies[0].name}</div>
      )}
    </div>
  );
}
