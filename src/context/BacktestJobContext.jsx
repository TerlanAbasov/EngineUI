import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

/**
 * Owns the backtest job for the whole app, so switching tabs (which unmounts the Backtest page) neither
 * loses a run in progress nor stops us learning that it finished. The run itself lives on the backend;
 * here we start it, poll it while it is RUNNING, and hold its outcome until the Backtest page has shown it.
 *
 * The job id is kept in sessionStorage so a page reload re-attaches; with nothing stored (another browser
 * tab) we ask the backend for a running job instead.
 */

const STORE_KEY = "qe.backtest.job";
const POLL_MS = 1000;
const RETRY_MS = [2000, 4000, 8000];   // back-off while the backend cannot be reached

const Ctx = createContext(null);

export function useBacktestJob() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBacktestJob must be used inside <BacktestJobProvider>");
  return v;
}

const readStore = () => {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (_) { return null; }
};
const writeStore = (v) => {
  try {
    if (v) sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(STORE_KEY);
  } catch (_) { /* storage blocked: reload just won't re-attach */ }
};

export function BacktestJobProvider({ children }) {
  const [job, setJob] = useState(null);
  const [consumedId, setConsumedId] = useState(null);   // the job whose outcome the Backtest page has already shown
  const [starting, setStarting] = useState(false);
  const [linkLost, setLinkLost] = useState(false);      // polling cannot reach the backend (the job keeps running there)

  const jobId = job?.id;
  const running = job?.status === "RUNNING";

  // ---- poll while RUNNING ---------------------------------------------------------------------
  useEffect(() => {
    if (!jobId || !running) return undefined;
    let cancelled = false;
    let timer = null;
    let failures = 0;
    const tick = async () => {
      try {
        const next = await api.getJob(jobId);
        if (cancelled) return;
        failures = 0;
        setLinkLost(false);
        setJob(next);                       // a terminal status re-runs this effect, which then stops polling
        if (next.status === "RUNNING") timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        if (e.status === 404) {             // the backend no longer knows this job
          setJob(null); setLinkLost(false); writeStore(null);
          return;
        }
        failures += 1;
        setLinkLost(true);
        timer = setTimeout(tick, RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, running]);

  // ---- re-attach after a reload / in a new browser tab ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = readStore();
        if (stored?.id) {
          try {
            const j = await api.getJob(stored.id);
            if (cancelled) return;
            setJob((prev) => prev ?? j);
            if (stored.consumed) setConsumedId((prev) => prev ?? j.id);
            return;
          } catch (e) {
            if (e.status !== 404) throw e;
            writeStore(null);               // forgotten by the backend: fall back to whatever is running
          }
        }
        const active = await api.activeJobs();
        if (!cancelled && active?.length) setJob((prev) => prev ?? active[0]);
      } catch (_) { /* backend unreachable: nothing to re-attach to */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- actions ---------------------------------------------------------------------------------

  /** Starts a backtest ("run" | "run-all" | "pairs" | "ensemble"); resolves with the job. */
  const start = useCallback(async (kind, body) => {
    setStarting(true);
    try {
      const j = await api.startJob(kind, body);
      setJob(j); setConsumedId(null); setLinkLost(false);
      writeStore({ id: j.id, consumed: false });
      return j;
    } catch (e) {
      const active = e.status === 409 ? e.body?.activeJob : null;
      if (active) {                         // someone (another tab / an earlier click) already started one: show it
        setJob(active); setConsumedId(null); setLinkLost(false);
        writeStore({ id: active.id, consumed: false });
        const err = new Error("A backtest is already running — showing its progress instead.");
        err.conflict = true;
        throw err;
      }
      throw e;
    } finally {
      setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    const j = await api.cancelJob(jobId);
    setJob((prev) => (prev && prev.id === j.id ? j : prev));
  }, [jobId]);

  /** The Backtest page has shown this job's outcome; it will not be offered again. */
  const consume = useCallback((id) => {
    setConsumedId(id);
    writeStore({ id, consumed: true });
  }, []);

  // a finished job nobody has looked at yet (finished while the user was on another tab)
  const pendingOutcome = job && job.status !== "RUNNING" && consumedId !== job.id ? job : null;

  const value = useMemo(
    () => ({ job, running, starting, linkLost, pendingOutcome, start, cancel, consume }),
    [job, running, starting, linkLost, pendingOutcome, start, cancel, consume]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
