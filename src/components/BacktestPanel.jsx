import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { fmt, cls, fmtDate, fmtDuration, KPI_KEYS, TIMEFRAMES, METRIC_HELP } from "../api/format";
import { useBacktestJob } from "../context/BacktestJobContext";
import ReportView from "./ReportView";
import EnsembleReport from "./EnsembleReport";
import JobProgressPanel from "./JobProgressPanel";

const PAIRS = "__PAIRS__";
const ENSEMBLE = "__ENSEMBLE__";

// Run-history metric columns: [metricKey, header, alwaysNegativeColour?]
const HIST_COLS = [
  ["totalReturnPct", "Total Return %"],
  ["cagrPct", "CAGR %"],
  ["sharpe", "Sharpe"],
  ["sortino", "Sortino"],
  ["calmar", "Calmar"],
  ["maxDrawdownPct", "Max DD %", true],
  ["annVolPct", "Ann Vol %"],
  ["winRatePct", "Win %"],
  ["profitFactor", "PF"],
];
const HIST_FILTERS = [
  ["minReturn", "min return %", "e.g. 50", "Only runs with total return at or above this"],
  ["minCagr", "min CAGR %", "e.g. 20", "Only runs with annualised return at or above this"],
  ["minSharpe", "min Sharpe", "e.g. 1", "Only runs with Sharpe at or above this"],
  ["minProfitFactor", "min PF", "e.g. 1.3", "Only runs with profit factor at or above this"],
  ["minWinRate", "min win %", "e.g. 45", "Only runs with win rate at or above this"],
  ["maxDrawdown", "max DD %", "e.g. 25", "Only runs whose worst drawdown is no deeper than this"],
  ["minTrades", "min trades", "e.g. 30", "Only runs with at least this many closed trades"],
];

export default function BacktestPanel() {
  const [strategies, setStrategies] = useState([]);
  const [timeframes, setTimeframes] = useState(TIMEFRAMES);
  const [form, setForm] = useState({
    strategyName: "ALL",
    symbols: "",
    start: "",
    end: "",
    capital: 100000,
    commissionBps: 1,
    slippageBps: 2,
    allowShort: true,
    // execution / risk controls
    timeframe: "AUTO",
    perStrategyTf: false,
    includeDisabled: false,   // run-all: also run disabled (non-archived) strategies
    positionSize: 1,
    execLag: 1,
    stopLossPct: "",     // blank = each strategy's own saved default (same convention as timeframe's Auto)
    takeProfitPct: "",
    riskFreePct: 0,
    warmupBars: 0,
    // pairs-only
    symbolA: "",
    symbolB: "",
    window: 60,
    entry: 2.0,
    exit: 0.5,
    // ensemble-only
    weighting: "config",
    ensembleNames: "",
  });
  const [showAdv, setShowAdv] = useState(false);
  const [lbNames, setLbNames] = useState([]);      // run-all: run only this subset of strategies (empty = all)
  const [lbNameSearch, setLbNameSearch] = useState("");
  const [coverage, setCoverage] = useState(null); // [{ symbol, firstBar, lastBar, bars, fresh }] — null until loaded (or if the call failed)
  const [universe, setUniverse] = useState(null); // ["MU", ...] — null until loaded
  const [leaderboard, setLeaderboard] = useState(null);
  const [sort, setSort] = useState(null); // { key, type: "num"|"str", dir: 1|-1 }
  const [result, setResult] = useState(null);
  const [ensemble, setEnsemble] = useState(null);
  const [history, setHistory] = useState([]);
  // The backtest itself runs on the backend as a job owned by BacktestJobProvider (so it survives leaving
  // this tab); this page starts it, shows its progress and displays its outcome.
  const jobCtx = useBacktestJob();
  const busy = jobCtx.starting || jobCtx.running;
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);         // { type: "info" | "error", text }
  const progressRef = useRef(null);
  const seenRunningId = useRef(null);                 // the job this page watched running (vs. one that finished while away)
  const [opening, setOpening] = useState(null);   // runId whose report is being fetched
  const [openErr, setOpenErr] = useState(null);   // { id, message } when a report couldn't be opened
  const reportRef = useRef(null);                 // where the opened report renders (below the leaderboard)
  const boardRef = useRef(null);
  const openSeq = useRef(0);                      // guards against a slower, older fetch landing last

  // ---- Run history: server-side filter + sort ----------------------------
  const HIST_LIMIT = 500;
  const [histStrat, setHistStrat] = useState("all");
  const [histSymbol, setHistSymbol] = useState("all");
  const [histSort, setHistSort] = useState({ key: "totalReturnPct", dir: -1 });   // most returns first
  const [histFilters, setHistFilters] = useState({
    minReturn: "", minCagr: "", minSharpe: "", minProfitFactor: "", minWinRate: "", maxDrawdown: "", minTrades: "",
  });
  const [histStratOptions, setHistStratOptions] = useState(["all"]);
  const [histSymbolOptions, setHistSymbolOptions] = useState([]);
  const [histTotal, setHistTotal] = useState(0);

  const histParams = () => ({
    strategy: histStrat === "all" ? "" : histStrat,
    symbol: histSymbol === "all" ? "" : histSymbol,
    ...histFilters,
    sort: histSort.key,
    dir: histSort.dir === -1 ? "desc" : "asc",
    limit: HIST_LIMIT,
  });
  const loadHistory = () => api.listRuns(histParams()).then(setHistory).catch(() => {});
  const loadHistoryMeta = () =>
    api.listRuns({ limit: 2000 }).then((rows) => {
      setHistTotal(rows.length);
      setHistStratOptions(["all", ...Array.from(new Set(rows.map((r) => r.strategy))).sort()]);
      setHistSymbolOptions(Array.from(new Set(rows.flatMap((r) => r.symbols || []))).sort());
    }).catch(() => {});

  useEffect(() => {
    api.strategies().then(setStrategies).catch((e) => setErr(e.message));
    api.backtestTimeframes().then((t) => t?.length && setTimeframes(t)).catch(() => {});
    api.dataSymbols().then(setCoverage).catch(() => {});
    api.universe().then(setUniverse).catch(() => {});
    loadHistory();
    loadHistoryMeta();
  }, []);

  // refetch history when the strategy / symbol / numeric filters or sort change (debounced)
  useEffect(() => {
    const t = setTimeout(loadHistory, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histStrat, histSymbol, histFilters, histSort]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isPairs = form.strategyName === PAIRS;
  const isEnsemble = form.strategyName === ENSEMBLE;
  const isAll = form.strategyName === "ALL";
  const isMulti = isEnsemble || isAll;
  const pickedStrategy = strategies.find((s) => s.name === form.strategyName);
  const enabledCount = strategies.filter((s) => s.enabled).length;

  const toggleLbName = (name) =>
    setLbNames((ns) => (ns.includes(name) ? ns.filter((n) => n !== name) : [...ns, name]));
  const lbNameChoices = useMemo(() => {
    const q = lbNameSearch.trim().toLowerCase();
    return strategies.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || (s.category || "").toLowerCase().includes(q));
  }, [strategies, lbNameSearch]);

  const parseSyms = (s) => s.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const selectedSyms = useMemo(() => new Set(parseSyms(form.symbols)), [form.symbols]);
  const toggleSymbol = (sym) => setForm((f) => {
    const cur = parseSyms(f.symbols);
    const next = cur.includes(sym) ? cur.filter((s) => s !== sym) : [...cur, sym];
    return { ...f, symbols: next.join(" ") };
  });
  // The Universe page is the single source of truth for which symbols the app works with, so the
  // picker lists exactly the universe symbols, in the universe's order — nothing is hidden and
  // nothing else appears (a symbol removed there must not linger here just because its bars are
  // still cached). Cached-bar coverage only decorates a chip: stale (newest bar is old) or no data
  // at all; it never decides whether the symbol is listed. If coverage failed to load, no chip is
  // marked, so every symbol stays selectable.
  const universeChips = useMemo(() => {
    if (!universe) return [];
    const bySym = new Map((coverage || []).map((c) => [c.symbol, c]));
    return universe.map((symbol) => {
      const cov = bySym.get(symbol) || null;
      return { symbol, cov, noData: coverage != null && cov == null, stale: cov != null && !cov.fresh };
    });
  }, [coverage, universe]);
  const staleCount = universeChips.filter((c) => c.stale).length;
  const noDataSymbols = universeChips.filter((c) => c.noData).map((c) => c.symbol);
  const chipTimeframe = universeChips.find((c) => c.cov)?.cov.timeframe;
  const addAllSymbols = () =>
    upd("symbols", universeChips.filter((c) => !c.noData).map((c) => c.symbol).join(" "));

  const ensembleBody = () => ({
    strategyNames: form.ensembleNames.trim()
      ? form.ensembleNames.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : null,
    symbols: form.symbols.trim() ? form.symbols.split(/[,\s]+/).map((s) => s.toUpperCase()).filter(Boolean) : null,
    start: form.start || null,
    end: form.end || null,
    capital: Number(form.capital),
    commissionBps: Number(form.commissionBps),
    slippageBps: Number(form.slippageBps),
    allowShort: form.allowShort,
    timeframe: form.timeframe,
    perStrategyTimeframe: form.perStrategyTf,
    positionSize: Number(form.positionSize),
    weighting: form.weighting,
  });

  const controls = () => ({
    timeframe: form.timeframe,
    positionSize: Number(form.positionSize),
    // blank -> null: on a named/batch strategy run this falls back to that strategy's own
    // saved default instead of forcing 0 (off) for everyone; a typed value (incl. 0) overrides uniformly.
    stopLossPct: form.stopLossPct === "" ? null : Number(form.stopLossPct),
    takeProfitPct: form.takeProfitPct === "" ? null : Number(form.takeProfitPct),
  });

  const body = () => ({
    strategyName: form.strategyName,
    symbols: form.symbols.trim() ? form.symbols.split(/[,\s]+/).map((s) => s.toUpperCase()).filter(Boolean) : null,
    start: form.start || null,
    end: form.end || null,
    capital: Number(form.capital),
    commissionBps: Number(form.commissionBps),
    slippageBps: Number(form.slippageBps),
    allowShort: form.allowShort,
    ...controls(),
    perStrategyTimeframe: form.perStrategyTf,
    includeDisabled: isAll && form.includeDisabled && lbNames.length === 0,
    strategyNames: isAll && lbNames.length ? lbNames : null,
    execLag: Number(form.execLag),
    riskFreePct: Number(form.riskFreePct),
    warmupBars: Number(form.warmupBars),
  });

  const pairsBody = () => ({
    symbolA: form.symbolA.trim().toUpperCase(),
    symbolB: form.symbolB.trim().toUpperCase(),
    window: Number(form.window),
    entry: Number(form.entry),
    exit: Number(form.exit),
    start: form.start || null,
    end: form.end || null,
    capital: Number(form.capital),
    commissionBps: Number(form.commissionBps),
    slippageBps: Number(form.slippageBps),
    ...controls(),
  });

  const run = async () => {
    openSeq.current++;
    setErr(null); setNotice(null); setResult(null); setOpenErr(null); setOpening(null); setLeaderboard(null); setSort(null); setEnsemble(null);
    setLbStrat(""); setLbSymbol("");
    try {
      let kind, payload;
      if (isPairs) {
        if (!form.symbolA.trim() || !form.symbolB.trim()) throw new Error("Enter both pair symbols");
        kind = "pairs"; payload = pairsBody();
      } else if (isEnsemble) {
        kind = "ensemble"; payload = ensembleBody();
      } else if (form.strategyName === "ALL") {
        kind = "run-all"; payload = body();
      } else {
        kind = "run"; payload = body();
      }
      const job = await jobCtx.start(kind, payload);
      seenRunningId.current = job.id;
      requestAnimationFrame(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      if (e.conflict) setNotice({ type: "info", text: e.message });
      else setErr(e.message);
    }
  };

  // Remember which job this page has watched running: one that finished while we were on another tab
  // is announced as such when its result is shown.
  useEffect(() => {
    if (jobCtx.running && jobCtx.job) seenRunningId.current = jobCtx.job.id;
  }, [jobCtx.running, jobCtx.job?.id]);           // eslint-disable-line react-hooks/exhaustive-deps

  // A finished job's outcome is shown once: right away if we were watching, or on returning to this page.
  const { pendingOutcome, consume } = jobCtx;
  useEffect(() => {
    const j = pendingOutcome;
    if (!j) return;
    const whileAway = seenRunningId.current !== j.id;
    openSeq.current++;
    if (j.status === "COMPLETED") {
      setErr(null); setOpenErr(null); setOpening(null); setResult(null); setLeaderboard(null); setEnsemble(null);
      setSort(null); setLbStrat(""); setLbSymbol("");
      if (j.kind === "RUN_ALL") setLeaderboard(Array.isArray(j.result) ? j.result : []);
      else if (j.kind === "ENSEMBLE") setEnsemble(j.result || null);
      else setResult(j.result || null);
      setNotice(whileAway
        ? { type: "info", text: `Your backtest finished while you were away (took ${fmtDuration(j.elapsedMs)}).` } : null);
      loadHistory();
      loadHistoryMeta();
    } else if (j.status === "FAILED") {
      setNotice({ type: "error", text: `Backtest failed: ${j.error || "unknown error"}` });
    } else if (j.status === "CANCELLED") {
      setNotice({ type: "info", text: "Backtest cancelled — nothing from it was saved." });
    }
    consume(j.id);
  }, [pendingOutcome?.id]);                        // eslint-disable-line react-hooks/exhaustive-deps

  // The report renders below the leaderboard / form, so scroll *to it* — scrolling to the top of
  // the page (as this used to) left it off-screen and made a row click look like it did nothing.
  const openRun = async (runId) => {
    const seq = ++openSeq.current;
    setResult(null); setOpenErr(null); setOpening(runId);
    try {
      const r = await api.getRun(runId);
      if (seq === openSeq.current) setResult(r);
    } catch (e) {
      if (seq === openSeq.current) setOpenErr({ id: runId, message: e.message });
    } finally {
      if (seq === openSeq.current) setOpening(null);
    }
  };

  const closeReport = () => {
    openSeq.current++;                            // drop any fetch still in flight
    setResult(null); setOpenErr(null); setOpening(null);
    requestAnimationFrame(() => {
      if (boardRef.current) boardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  useEffect(() => {
    if (result || opening != null || openErr)
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result?.runId, opening, openErr]);          // eslint-disable-line react-hooks/exhaustive-deps

  const removeRun = async (runId, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete run #${runId}? This cannot be undone.`)) return;
    try {
      await api.deleteRun(runId);
      setHistory((h) => h.filter((r) => r.runId !== runId));
      setHistTotal((n) => Math.max(0, n - 1));
      if (result?.runId === runId) setResult(null);
    } catch (err2) { setErr(err2.message); }
  };

  const tfLabel = (id) =>
    id === "PER_STRATEGY" ? "per-strategy"
      : id === "AUTO" ? "auto"
        : timeframes.find((t) => t.id === id)?.label || id || "Native";

  const clickSort = (key, type) =>
    setSort((s) =>
      s && s.key === key
        ? { key, type, dir: s.dir === -1 ? 1 : -1 }
        : { key, type, dir: type === "str" ? 1 : -1 });

  // ---- Leaderboard: client-side filter (strategy / stock) + column sort ----
  const [lbStrat, setLbStrat] = useState("");
  const [lbSymbol, setLbSymbol] = useState("");

  const lbSymbolOptions = useMemo(
    () => Array.from(new Set((leaderboard || []).flatMap((e) => e.symbols || []))).sort(),
    [leaderboard]);

  const boardView = useMemo(() => {
    if (!leaderboard) return null;
    const sName = lbStrat.trim().toLowerCase();
    const sSym = lbSymbol.trim().toUpperCase();
    let rows = leaderboard.filter((e) =>
      (!sName || e.strategy.toLowerCase().includes(sName)) &&
      (!sSym || (e.symbols || []).includes(sSym)));
    if (sort) {
      const pick = (e) =>
        sort.key === "strategy" ? e.strategy
          : sort.key === "timeframe" ? tfLabel(e.timeframe)
            : e.metrics?.[sort.key];
      rows = [...rows].sort((a, b) => {
        const x = pick(a), y = pick(b);
        if (sort.type === "str") return sort.dir * String(x ?? "").localeCompare(String(y ?? ""));
        const nx = x == null || Number.isNaN(x) ? -Infinity : x;
        const ny = y == null || Number.isNaN(y) ? -Infinity : y;
        return sort.dir * (nx - ny);
      });
    }
    return rows;
  }, [leaderboard, sort, lbStrat, lbSymbol, timeframes]);

  const sortArrow = (k) => (sort?.key === k ? (sort.dir === -1 ? " ▼" : " ▲") : "");

  // Run history sorts + filters server-side; clicking a header flips direction.
  const STR_SORT = new Set(["strategy", "timeframe"]);
  const clickHistSort = (key) =>
    setHistSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: STR_SORT.has(key) ? 1 : -1 }));
  const histArrow = (k) => (histSort.key === k ? (histSort.dir === -1 ? " ▼" : " ▲") : "");
  const setFilter = (k, v) => setHistFilters((f) => ({ ...f, [k]: v }));
  const filtersActive = Object.values(histFilters).some((v) => v !== "");
  const resetFilters = () => setHistFilters({
    minReturn: "", minCagr: "", minSharpe: "", minProfitFactor: "", minWinRate: "", maxDrawdown: "", minTrades: "",
  });

  // ---- Prune: keep the most profitable strategies, archive + delete the rest ----
  const [pruneVal, setPruneVal] = useState(50);
  const [pruneMode, setPruneMode] = useState("pct");        // pct | count
  const [pruneBy, setPruneBy] = useState("totalReturnPct");
  const [pruneRemoval, setPruneRemoval] = useState("archive");   // archive | disable | delete
  const [pruneRecent, setPruneRecent] = useState(2);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneMsg, setPruneMsg] = useState(null);

  const doPrune = async () => {
    const n = Math.max(1, Number(pruneVal) || (pruneMode === "pct" ? 50 : 20));
    const win = Math.max(1, Number(pruneRecent) || 2);
    const label = pruneBy === "sharpe" ? "Sharpe" : "total return";
    const scope = pruneMode === "pct" ? `top ${n}%` : `top ${n}`;
    const removalVerb = pruneRemoval === "delete" ? "PERMANENTLY DELETE (config + all history)"
      : pruneRemoval === "disable" ? "disable" : "ARCHIVE (hidden, reversible)";
    if (!window.confirm(
      `Rank strategies by the average ${label} of their last ${win} run(s), keep the ${scope}, ` +
      `then ${removalVerb} the rest and permanently delete all their runs, results and trades either way. ` +
      `${pruneRemoval === "delete" ? "This cannot be undone." : "Archiving/disabling is reversible; the run-history deletes are not."} Continue?`
    )) return;
    setPruneBusy(true); setErr(null); setPruneMsg(null);
    try {
      const r = await api.pruneHistory({
        [pruneMode === "pct" ? "keepPct" : "keep"]: n,
        recentRuns: win, by: pruneBy, mode: pruneRemoval,
      });
      setPruneMsg(`Ranked ${r.ranked} by avg ${r.rankedBy} of last ${r.rankWindow} runs — kept ${r.kept.length}, ${pruneRemoval}d ${r.losers.length}, deleted ${r.deletedRuns} runs.`);
      setHistFilters({ minReturn: "", minCagr: "", minSharpe: "", minProfitFactor: "", minWinRate: "", maxDrawdown: "", minTrades: "" });
      loadHistory();
      loadHistoryMeta();
      api.strategies().then(setStrategies).catch(() => {});
    } catch (e) { setErr(e.message); } finally { setPruneBusy(false); }
  };

  return (
    <div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Backtest</h2>
        <div className="form-grid">
          <div>
            <label>Strategy</label>
            <select value={form.strategyName} onChange={(e) => upd("strategyName", e.target.value)} style={{ width: "100%" }}>
              <option value="ALL">▶ All enabled — leaderboard ({enabledCount})</option>
              <option value={ENSEMBLE}>✦ Ensemble (blended portfolio)</option>
              <option value={PAIRS}>◆ Pairs trading (market-neutral)</option>
              {strategies.map((s) => <option key={s.name} value={s.name}>{s.name}{s.enabled ? "" : " (disabled)"}</option>)}
            </select>
            {isAll && lbNames.length === 0 && (
              <label className="toggle-inline" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginTop: 4 }}
                     title="Also run strategies that are turned off (archived strategies are still excluded)">
                <input type="checkbox" checked={form.includeDisabled}
                       onChange={(e) => upd("includeDisabled", e.target.checked)} />
                include disabled ({strategies.length} total)
              </label>
            )}
          </div>

          {isPairs ? (
            <>
              <div><label>Symbol A</label><input style={{ width: "100%" }} placeholder="KO" value={form.symbolA} onChange={(e) => upd("symbolA", e.target.value)} /></div>
              <div><label>Symbol B</label><input style={{ width: "100%" }} placeholder="PEP" value={form.symbolB} onChange={(e) => upd("symbolB", e.target.value)} /></div>
              <div><label>Z-score window</label><input type="number" style={{ width: "100%" }} value={form.window} onChange={(e) => upd("window", e.target.value)} /></div>
              <div><label>Entry z</label><input type="number" step="0.1" style={{ width: "100%" }} value={form.entry} onChange={(e) => upd("entry", e.target.value)} /></div>
              <div><label>Exit z</label><input type="number" step="0.1" style={{ width: "100%" }} value={form.exit} onChange={(e) => upd("exit", e.target.value)} /></div>
            </>
          ) : (
            <>
              <div><label>Symbols (blank = universe)</label><input style={{ width: "100%" }} placeholder="AAPL MSFT…" value={form.symbols} onChange={(e) => upd("symbols", e.target.value)} /></div>
              {universe && universe.length > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {universe.length} universe symbol{universe.length === 1 ? "" : "s"}
                      {chipTimeframe ? ` @ ${chipTimeframe}` : ""} — click to add / remove
                      {staleCount > 0 && ` · ${staleCount} in amber: data not refreshed recently (hover for the last bar)`}
                    </span>
                    {universeChips.some((c) => !c.noData) && (
                      <button type="button" className="secondary xs" onClick={addAllSymbols}>add all</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 108, overflow: "auto" }}>
                    {universeChips.map((c) => {
                      const on = selectedSyms.has(c.symbol);
                      const title = c.noData
                        ? "No cached data yet — pull it on the Universe page to backtest it"
                        : `${c.cov ? `${c.cov.bars} ${c.cov.timeframe || ""} bars · last ${fmtDate(c.cov.lastBar)}` : "coverage unavailable"}${c.stale ? " · stale" : ""}`;
                      return (
                        <span key={c.symbol} className={c.noData ? "tag" : "tag row-click"} title={title}
                              aria-disabled={c.noData || undefined}
                              onClick={c.noData ? undefined : () => toggleSymbol(c.symbol)}
                              style={{
                                cursor: c.noData ? "not-allowed" : "pointer",
                                opacity: c.noData ? 0.45 : 1,
                                borderColor: on ? "var(--accent)" : undefined,
                                color: on ? "var(--accent)" : c.stale ? "var(--amber)" : undefined,
                              }}>
                          {on ? "✓ " : ""}{c.symbol}
                        </span>
                      );
                    })}
                  </div>
                  {noDataSymbols.length > 0 && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      No cached data yet for {noDataSymbols.join(", ")} — pull it on the Universe page to backtest it.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {isAll && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label>
                Strategies to run <span className="muted" style={{ textTransform: "none" }}>
                  ({lbNames.length ? `${lbNames.length} picked` : `none picked — running all ${form.includeDisabled ? strategies.length : enabledCount}`})</span>
              </label>
              {lbNames.length > 0 && (
                <div className="chip-row" style={{ margin: "4px 0" }}>
                  {lbNames.map((n) => (
                    <span key={n} className="tag row-click" onClick={() => toggleLbName(n)} title="remove">{n} ✕</span>
                  ))}
                  <span className="tag row-click" onClick={() => setLbNames([])} title="clear all">clear</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "4px 0" }}>
                <input placeholder="search name / category…" value={lbNameSearch}
                       onChange={(e) => setLbNameSearch(e.target.value)} style={{ flex: "1 1 200px" }} />
                <button type="button" className="secondary xs"
                        onClick={() => setLbNames(Array.from(new Set([...lbNames, ...lbNameChoices.map((s) => s.name)])))}>
                  add {lbNameChoices.length} shown
                </button>
              </div>
              <div className="table-scroll" style={{ maxHeight: 160, padding: "4px 8px" }}>
                {lbNameChoices.map((s) => (
                  <label key={s.name} className="row-click"
                         style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", textTransform: "none", fontSize: 13 }}>
                    <input type="checkbox" checked={lbNames.includes(s.name)} onChange={() => toggleLbName(s.name)} />
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span className="tag">{s.category}</span>
                    {!s.enabled && <span className="muted" style={{ fontSize: 11 }}>disabled</span>}
                  </label>
                ))}
                {lbNameChoices.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 4 }}>no match</div>}
              </div>
            </div>
          )}

          {isEnsemble && (
            <>
              <div>
                <label>Leg weighting</label>
                <select value={form.weighting} onChange={(e) => upd("weighting", e.target.value)} style={{ width: "100%" }}>
                  <option value="config">Per-strategy weight (Strategies tab)</option>
                  <option value="equal">Equal weight</option>
                  <option value="sharpe">Weight ∝ standalone Sharpe</option>
                </select>
              </div>
              <div>
                <label>Strategies (blank = all enabled)</label>
                <input style={{ width: "100%" }} placeholder="sma_cross rsi2 donchian"
                       value={form.ensembleNames} onChange={(e) => upd("ensembleNames", e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label>Timeframe</label>
            <select value={form.timeframe} onChange={(e) => upd("timeframe", e.target.value)}
                    disabled={isMulti && form.perStrategyTf} style={{ width: "100%" }}>
              <option value="AUTO">
                Auto{pickedStrategy ? ` — ${tfLabel(pickedStrategy.recommendedTimeframe)}` : " (strategy default)"}
              </option>
              {timeframes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}{t.nativeFrame ? " (stored bars)" : ""}</option>
              ))}
            </select>
            {isMulti && (
              <label className="toggle-inline" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginTop: 4 }}>
                <input type="checkbox" checked={form.perStrategyTf}
                       onChange={(e) => upd("perStrategyTf", e.target.checked)} />
                run each strategy on its own best TF
              </label>
            )}
          </div>

          <div><label>Start date</label><input type="date" style={{ width: "100%" }} value={form.start} onChange={(e) => upd("start", e.target.value)} /></div>
          <div><label>End date</label><input type="date" style={{ width: "100%" }} value={form.end} onChange={(e) => upd("end", e.target.value)} /></div>
          <div><label>Capital</label><input type="number" style={{ width: "100%" }} value={form.capital} onChange={(e) => upd("capital", e.target.value)} /></div>
          <div><label>Commission bps</label><input type="number" style={{ width: "100%" }} value={form.commissionBps} onChange={(e) => upd("commissionBps", e.target.value)} /></div>
          <div><label>Slippage bps</label><input type="number" style={{ width: "100%" }} value={form.slippageBps} onChange={(e) => upd("slippageBps", e.target.value)} /></div>
          <div>
            <label>Position size ×</label>
            <input type="number" step="0.25" min="0.1" max="5" style={{ width: "100%" }}
                   value={form.positionSize} onChange={(e) => upd("positionSize", e.target.value)} />
          </div>
          <div>
            <label>Stop-loss % <span className="muted">(blank = per-strategy default)</span></label>
            <input type="number" step="0.5" min="0" style={{ width: "100%" }} placeholder="Auto"
                   value={form.stopLossPct} onChange={(e) => upd("stopLossPct", e.target.value)} />
          </div>
          <div>
            <label>Take-profit % <span className="muted">(blank = per-strategy default)</span></label>
            <input type="number" step="0.5" min="0" style={{ width: "100%" }} placeholder="Auto"
                   value={form.takeProfitPct} onChange={(e) => upd("takeProfitPct", e.target.value)} />
          </div>
          {!isPairs && (
            <div>
              <label>Allow short</label>
              <label className="toggle" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={form.allowShort} onChange={(e) => upd("allowShort", e.target.checked)} />
                <span className="slider" />
              </label>
            </div>
          )}
          <div><button disabled={busy} onClick={run} style={{ width: "100%" }}>{busy ? "Running…" : "Run backtest"}</button></div>
        </div>

        {!isPairs && !isEnsemble && (
          <div style={{ marginTop: 10 }}>
            <button className="secondary" type="button" onClick={() => setShowAdv((v) => !v)}>
              {showAdv ? "▾ Hide advanced" : "▸ Advanced execution controls"}
            </button>
            {showAdv && (
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div>
                  <label>Execution lag (bars)</label>
                  <input type="number" min="0" max="5" style={{ width: "100%" }}
                         value={form.execLag} onChange={(e) => upd("execLag", e.target.value)} />
                  <div className="muted" style={{ fontSize: 11 }}>1 = fill next bar (no look-ahead)</div>
                </div>
                <div>
                  <label>Risk-free % (annual)</label>
                  <input type="number" step="0.25" min="0" style={{ width: "100%" }}
                         value={form.riskFreePct} onChange={(e) => upd("riskFreePct", e.target.value)} />
                  <div className="muted" style={{ fontSize: 11 }}>Excess return for Sharpe / Sortino</div>
                </div>
                <div>
                  <label>Warm-up bars</label>
                  <input type="number" min="0" style={{ width: "100%" }}
                         value={form.warmupBars} onChange={(e) => upd("warmupBars", e.target.value)} />
                  <div className="muted" style={{ fontSize: 11 }}>Skip P&amp;L while indicators settle</div>
                </div>
              </div>
            )}
          </div>
        )}
        {err && <div className="neg" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {jobCtx.running && jobCtx.job && (
        <div ref={progressRef} style={{ scrollMarginTop: 12 }}>
          <JobProgressPanel job={jobCtx.job} linkLost={jobCtx.linkLost} onCancel={jobCtx.cancel} />
        </div>
      )}

      {notice && (
        <div className="panel notice" role="status">
          <span className={notice.type === "error" ? "neg" : undefined}>{notice.text}</span>
          <button className="secondary xs" onClick={() => setNotice(null)}>dismiss</button>
        </div>
      )}

      {leaderboard && (
        <div className="panel" ref={boardRef}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Leaderboard
              <span className="count"> · {boardView.length}{boardView.length !== leaderboard.length ? ` of ${leaderboard.length}` : ""} strategies</span>
            </h3>
            <span className="chip-row">
              {lbSymbolOptions.slice(0, 12).map((s) => <span key={s} className="tag">{s}</span>)}
              {lbSymbolOptions.length > 12 && <span className="tag">+{lbSymbolOptions.length - 12}</span>}
            </span>
          </div>
          {lbNames.length > 0 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ran {leaderboard.length} picked strateg{leaderboard.length === 1 ? "y" : "ies"}.</div>
          ) : leaderboard.length < strategies.length && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Ran {leaderboard.length} of {strategies.length} strategies — the rest are disabled.
              {" "}Tick <b>include disabled</b> next to the Strategy picker, or enable them in the Strategies tab.
            </div>
          )}
          <div className="filters">
            <div className="field">
              <label>Strategy</label>
              <input placeholder="search name…" value={lbStrat} onChange={(e) => setLbStrat(e.target.value)} />
            </div>
            <div className="field">
              <label>Stock</label>
              <input list="lb-symbols" placeholder="e.g. AAPL" value={lbSymbol} onChange={(e) => setLbSymbol(e.target.value)} />
              <datalist id="lb-symbols">{lbSymbolOptions.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            {(lbStrat || lbSymbol) && (
              <button className="secondary xs" onClick={() => { setLbStrat(""); setLbSymbol(""); }}>clear</button>
            )}
            <span className="count">click a header to sort · hover for meaning · click a row for the report</span>
          </div>
          <div className="table-scroll" style={{ maxHeight: 460 }}>
            <table>
              <thead>
                <tr>
                  <th className="row-click" title="Strategy name" onClick={() => clickSort("strategy", "str")}>Strategy{sortArrow("strategy")}</th>
                  <th className="row-click" title="Bar interval the run used" onClick={() => clickSort("timeframe", "str")}>TF{sortArrow("timeframe")}</th>
                  {KPI_KEYS.map(([k, l]) => (
                    <th key={k} className="row-click" title={METRIC_HELP[k]} onClick={() => clickSort(k, "num")}>{l}{sortArrow(k)}</th>
                  ))}
                  <th className="row-click" title="Closed long trades / closed short trades" onClick={() => clickSort("longOps", "num")}>Long / Short{sortArrow("longOps")}</th>
                </tr>
              </thead>
              <tbody>
                {boardView.map((e) => (
                  <tr key={e.runId} className="row-click" onClick={() => openRun(e.runId)}
                      style={result?.runId === e.runId || opening === e.runId ? { background: "#161d29" } : undefined}>
                    <td style={{ fontWeight: 600 }}>{e.strategy}</td>
                    <td className="muted">{tfLabel(e.timeframe)}</td>
                    {KPI_KEYS.map(([k]) => <td key={k} className={cls(e.metrics?.[k])}>{fmt(e.metrics?.[k])}</td>)}
                    <td className="muted">{fmt(e.metrics?.longOps, 0)} / {fmt(e.metrics?.shortOps, 0)}</td>
                  </tr>
                ))}
                {boardView.length === 0 && (
                  <tr><td colSpan={KPI_KEYS.length + 3} className="empty">No strategies match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ensemble && <EnsembleReport result={ensemble} />}

      <div ref={reportRef} style={{ scrollMarginTop: 12 }}>
        {opening != null && <div className="panel muted">Opening run #{opening}…</div>}
        {openErr && (
          <div className="panel">
            <span className="neg">Could not open run #{openErr.id}: {openErr.message}</span>{" "}
            <button className="secondary xs" onClick={() => openRun(openErr.id)}>retry</button>{" "}
            <button className="secondary xs" onClick={closeReport}>dismiss</button>
          </div>
        )}
        {result && (
          <>
            {(leaderboard || history.length > 0) && (
              <button className="secondary" style={{ margin: "0 0 12px" }} onClick={closeReport}>
                ← Back{leaderboard ? " to leaderboard" : ""}
              </button>
            )}
            <ReportView key={result.runId} result={result} />
          </>
        )}
      </div>

      {histTotal > 0 && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Run history <span className="muted">
              ({history.length}{history.length !== histTotal ? ` of ${histTotal}` : ""} — click a header to sort · hover it for what it means · click a row to reload)</span></h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12 }}>keep top</span>
              <input type="number" min="1" style={{ width: 52 }} value={pruneVal}
                     onChange={(e) => setPruneVal(e.target.value)} />
              <select value={pruneMode} onChange={(e) => setPruneMode(e.target.value)}>
                <option value="pct">%</option>
                <option value="count">count</option>
              </select>
              <select value={pruneBy} onChange={(e) => setPruneBy(e.target.value)}>
                <option value="totalReturnPct">by total return</option>
                <option value="sharpe">by Sharpe</option>
              </select>
              <span className="muted" style={{ fontSize: 12 }}>· last</span>
              <input type="number" min="1" style={{ width: 44 }} value={pruneRecent}
                     onChange={(e) => setPruneRecent(e.target.value)} title="rank on the average of each strategy's N most recent runs" />
              <span className="muted" style={{ fontSize: 12 }}>runs ·</span>
              <select value={pruneRemoval} onChange={(e) => setPruneRemoval(e.target.value)}
                      title="What to do with the strategies that don't make the cut">
                <option value="archive">archive rest</option>
                <option value="disable">disable rest</option>
                <option value="delete">delete rest</option>
              </select>
              <button className="secondary" disabled={pruneBusy} onClick={doPrune}
                      title="Keep the top-ranked strategies; the rest are archived/disabled/deleted per the selector, and always lose their run history">
                {pruneBusy ? "Pruning…" : "Prune"}
              </button>
            </div>
          </div>
          {pruneMsg && <div className="pos" style={{ marginBottom: 8 }}>{pruneMsg}</div>}

          <div className="filters">
            <div className="field" title="Show only runs of this strategy">
              <label>Strategy</label>
              <select value={histStrat} onChange={(e) => setHistStrat(e.target.value)} style={{ minWidth: 150 }}>
                {histStratOptions.map((s) => <option key={s} value={s}>{s === "all" ? "all strategies" : s}</option>)}
              </select>
            </div>
            <div className="field" title="Show only runs whose universe included this stock">
              <label>Stock</label>
              <select value={histSymbol} onChange={(e) => setHistSymbol(e.target.value)} style={{ minWidth: 120 }}>
                <option value="all">all stocks</option>
                {histSymbolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {HIST_FILTERS.map(([k, label, ph, help]) => (
              <div className="field" key={k} title={help}>
                <label>{label}</label>
                <input type="number" step="any" placeholder={ph} style={{ width: 90 }} value={histFilters[k]}
                       onChange={(e) => setFilter(k, e.target.value)} />
              </div>
            ))}
            {(filtersActive || histStrat !== "all" || histSymbol !== "all") &&
              <button className="secondary xs"
                      onClick={() => { resetFilters(); setHistStrat("all"); setHistSymbol("all"); }}>clear filters</button>}
          </div>

          <div className="table-scroll" style={{ maxHeight: 340 }}>
            <table>
              <thead>
                <tr>
                  <th className="row-click" title="Run id" onClick={() => clickHistSort("runId")}>Run{histArrow("runId")}</th>
                  <th className="row-click" title="Strategy name" onClick={() => clickHistSort("strategy")}>Strategy{histArrow("strategy")}</th>
                  <th title="Number of stocks in the run's universe (hover a row for the list)">Stocks</th>
                  <th className="row-click" title="Bar interval the run used" onClick={() => clickHistSort("timeframe")}>TF{histArrow("timeframe")}</th>
                  {HIST_COLS.map(([k, l]) => (
                    <th key={k} className="row-click" title={METRIC_HELP[k]} onClick={() => clickHistSort(k)}>{l}{histArrow(k)}</th>
                  ))}
                  <th className="row-click" title={METRIC_HELP.trades} onClick={() => clickHistSort("trades")}>Trades{histArrow("trades")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.runId} className="row-click" onClick={() => openRun(e.runId)}
                      style={result?.runId === e.runId ? { background: "#161d29" } : undefined}>
                    <td className="muted">#{e.runId}</td>
                    <td style={{ fontWeight: 600 }}>{e.strategy}</td>
                    <td className="muted" title={(e.symbols || []).join(", ")}>{(e.symbols || []).length || "–"}</td>
                    <td className="muted">{tfLabel(e.timeframe)}</td>
                    {HIST_COLS.map(([k, , neg]) => (
                      <td key={k} className={neg ? "neg" : cls(e.metrics?.[k])}>{fmt(e.metrics?.[k])}</td>
                    ))}
                    <td>{fmt(e.metrics?.trades, 0)}</td>
                    <td><span className="row-click neg" title="delete run" style={{ fontWeight: 700 }}
                              onClick={(ev) => removeRun(e.runId, ev)}>×</span></td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={HIST_COLS.length + 6} className="empty">No runs match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
