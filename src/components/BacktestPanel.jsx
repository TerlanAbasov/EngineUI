import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { fmt, cls, fmtDate, KPI_KEYS, TIMEFRAMES, METRIC_HELP } from "../api/format";
import ReportView from "./ReportView";
import EnsembleReport from "./EnsembleReport";

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
  const [coverage, setCoverage] = useState([]);   // [{ symbol, firstBar, lastBar, bars, fresh }]
  const [showStale, setShowStale] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);
  const [sort, setSort] = useState(null); // { key, type: "num"|"str", dir: 1|-1 }
  const [result, setResult] = useState(null);
  const [ensemble, setEnsemble] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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
  const freshCount = useMemo(() => coverage.filter((c) => c.fresh).length, [coverage]);
  const pickable = useMemo(
    () => (showStale ? coverage : coverage.filter((c) => c.fresh)),
    [coverage, showStale]);
  const addAllSymbols = () => upd("symbols", pickable.map((c) => c.symbol).join(" "));

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
    setBusy(true); setErr(null); setResult(null); setLeaderboard(null); setSort(null); setEnsemble(null);
    setLbStrat(""); setLbSymbol("");
    try {
      if (isPairs) {
        if (!form.symbolA.trim() || !form.symbolB.trim()) throw new Error("Enter both pair symbols");
        setResult(await api.pairs(pairsBody()));
      } else if (isEnsemble) {
        setEnsemble(await api.ensemble(ensembleBody()));
      } else if (form.strategyName === "ALL") {
        setLeaderboard(await api.runAll(body()));
      } else {
        setResult(await api.backtest(body()));
      }
      loadHistory();
      loadHistoryMeta();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const openRun = async (runId) => {
    setBusy(true); setErr(null);
    try { setResult(await api.getRun(runId)); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

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
              {coverage.length > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {freshCount} symbol{freshCount === 1 ? "" : "s"} with fresh data
                      {coverage[0]?.timeframe ? ` @ ${coverage[0].timeframe}` : ""} — click to add / remove
                      {coverage.length > freshCount && (
                        <>
                          {" · "}
                          <span className="row-click" onClick={() => setShowStale((v) => !v)}>
                            {showStale ? "hide stale" : `show ${coverage.length - freshCount} stale`}
                          </span>
                        </>
                      )}
                    </span>
                    {pickable.length > 0 && (
                      <button type="button" className="secondary xs" onClick={addAllSymbols}>add all</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 108, overflow: "auto" }}>
                    {pickable.map((c) => {
                      const on = selectedSyms.has(c.symbol);
                      return (
                        <span key={c.symbol} className="tag row-click"
                              title={`${c.bars} ${c.timeframe || ""} bars · last ${fmtDate(c.lastBar)}${c.fresh ? "" : " · stale"}`}
                              onClick={() => toggleSymbol(c.symbol)}
                              style={{
                                cursor: "pointer",
                                borderColor: on ? "var(--accent)" : undefined,
                                color: on ? "var(--accent)" : c.fresh ? undefined : "#5b6570",
                              }}>
                          {on ? "✓ " : ""}{c.symbol}
                        </span>
                      );
                    })}
                    {pickable.length === 0 && <span className="muted" style={{ fontSize: 12 }}>no symbols with fresh data</span>}
                  </div>
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

      {leaderboard && (
        <div className="panel">
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
                      style={result?.runId === e.runId ? { background: "#161d29" } : undefined}>
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

      {result && (
        <>
          {(leaderboard || history.length > 0) && (
            <button className="secondary" style={{ margin: "0 0 12px" }}
                    onClick={() => { setResult(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              ← Back{leaderboard ? " to leaderboard" : ""}
            </button>
          )}
          <ReportView result={result} />
        </>
      )}

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
