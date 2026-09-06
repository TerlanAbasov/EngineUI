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
    positionSize: 1,
    execLag: 1,
    stopLossPct: 0,
    takeProfitPct: 0,
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
  const [histSort, setHistSort] = useState({ key: "totalReturnPct", dir: -1 });   // most returns first
  const [histFilters, setHistFilters] = useState({
    minReturn: "", minCagr: "", minSharpe: "", minProfitFactor: "", minWinRate: "", maxDrawdown: "", minTrades: "",
  });
  const [histStratOptions, setHistStratOptions] = useState(["all"]);
  const [histTotal, setHistTotal] = useState(0);

  const histParams = () => ({
    strategy: histStrat === "all" ? "" : histStrat,
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
    }).catch(() => {});

  useEffect(() => {
    api.strategies().then(setStrategies).catch((e) => setErr(e.message));
    api.backtestTimeframes().then((t) => t?.length && setTimeframes(t)).catch(() => {});
    api.dataSymbols().then(setCoverage).catch(() => {});
    loadHistory();
    loadHistoryMeta();
  }, []);

  // refetch history when the strategy filter, numeric filters or sort change (debounced)
  useEffect(() => {
    const t = setTimeout(loadHistory, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histStrat, histFilters, histSort]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isPairs = form.strategyName === PAIRS;
  const isEnsemble = form.strategyName === ENSEMBLE;
  const isAll = form.strategyName === "ALL";
  const isMulti = isEnsemble || isAll;
  const pickedStrategy = strategies.find((s) => s.name === form.strategyName);

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
    stopLossPct: Number(form.stopLossPct),
    takeProfitPct: Number(form.takeProfitPct),
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

  const sortedBoard = useMemo(() => {
    if (!leaderboard || !sort) return leaderboard;
    const pick = (e) =>
      sort.key === "strategy" ? e.strategy
        : sort.key === "timeframe" ? tfLabel(e.timeframe)
          : e.metrics?.[sort.key];
    return [...leaderboard].sort((a, b) => {
      const x = pick(a), y = pick(b);
      if (sort.type === "str") return sort.dir * String(x ?? "").localeCompare(String(y ?? ""));
      const nx = x == null || Number.isNaN(x) ? -Infinity : x;
      const ny = y == null || Number.isNaN(y) ? -Infinity : y;
      return sort.dir * (nx - ny);
    });
  }, [leaderboard, sort, timeframes]);

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

  // ---- Prune history: keep only the top-N strategies ---------------------
  const [pruneKeep, setPruneKeep] = useState(20);
  const [pruneBy, setPruneBy] = useState("sharpe");
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneMsg, setPruneMsg] = useState(null);

  const doPrune = async () => {
    const n = Math.max(1, Number(pruneKeep) || 20);
    const label = pruneBy === "totalReturnPct" ? "total return" : "Sharpe";
    if (!window.confirm(
      `Keep only the top ${n} strategies by best ${label} and PERMANENTLY delete every backtest run ` +
      `(runs, results, trades) for the rest — and disable those strategies. This cannot be undone. Continue?`
    )) return;
    setPruneBusy(true); setErr(null); setPruneMsg(null);
    try {
      const r = await api.pruneHistory(n, pruneBy);
      setPruneMsg(`Kept ${r.kept.length} (by ${r.rankedBy}), disabled ${r.disabled.length}, deleted ${r.deletedRuns} runs.`);
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
              <option value="ALL">▶ All enabled (leaderboard)</option>
              <option value={ENSEMBLE}>✦ Ensemble (blended portfolio)</option>
              <option value={PAIRS}>◆ Pairs trading (market-neutral)</option>
              {strategies.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
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
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
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
            <label>Stop-loss % <span className="muted">(0 = off)</span></label>
            <input type="number" step="0.5" min="0" style={{ width: "100%" }}
                   value={form.stopLossPct} onChange={(e) => upd("stopLossPct", e.target.value)} />
          </div>
          <div>
            <label>Take-profit % <span className="muted">(0 = off)</span></label>
            <input type="number" step="0.5" min="0" style={{ width: "100%" }}
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
          <h3 style={{ marginTop: 0 }}>Leaderboard <span className="muted">(click a header to sort · hover it for what it means · click a row for the full report)</span></h3>
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
              {sortedBoard.map((e) => (
                <tr key={e.runId} className="row-click" onClick={() => openRun(e.runId)}
                    style={result?.runId === e.runId ? { background: "#161d29" } : undefined}>
                  <td style={{ fontWeight: 600 }}>{e.strategy}</td>
                  <td className="muted">{tfLabel(e.timeframe)}</td>
                  {KPI_KEYS.map(([k]) => <td key={k} className={cls(e.metrics?.[k])}>{fmt(e.metrics?.[k])}</td>)}
                  <td className="muted">{fmt(e.metrics?.longOps, 0)} / {fmt(e.metrics?.shortOps, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <select value={histStrat} onChange={(e) => setHistStrat(e.target.value)}>
                {histStratOptions.map((s) => <option key={s} value={s}>{s === "all" ? "all strategies" : s}</option>)}
              </select>
              <span style={{ borderLeft: "1px solid #2a3441", height: 20 }} />
              <span className="muted" style={{ fontSize: 12 }}>keep top</span>
              <input type="number" min="1" style={{ width: 56 }} value={pruneKeep}
                     onChange={(e) => setPruneKeep(e.target.value)} />
              <select value={pruneBy} onChange={(e) => setPruneBy(e.target.value)}>
                <option value="sharpe">by Sharpe</option>
                <option value="totalReturnPct">by total return</option>
              </select>
              <button className="secondary" disabled={pruneBusy} onClick={doPrune}
                      title="Disable every other strategy and permanently delete its run history">
                {pruneBusy ? "Pruning…" : "Prune"}
              </button>
            </div>
          </div>
          {pruneMsg && <div className="pos" style={{ marginBottom: 8 }}>{pruneMsg}</div>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 10 }}>
            {HIST_FILTERS.map(([k, label, ph, help]) => (
              <div key={k} title={help}>
                <label style={{ fontSize: 11 }}>{label}</label>
                <input type="number" step="any" placeholder={ph} style={{ width: 90 }} value={histFilters[k]}
                       onChange={(e) => setFilter(k, e.target.value)} />
              </div>
            ))}
            {filtersActive && <button className="secondary" onClick={resetFilters}>clear filters</button>}
          </div>

          <div style={{ maxHeight: 340, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th className="row-click" title="Run id" onClick={() => clickHistSort("runId")}>Run{histArrow("runId")}</th>
                  <th className="row-click" title="Strategy name" onClick={() => clickHistSort("strategy")}>Strategy{histArrow("strategy")}</th>
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
                  <tr><td colSpan={HIST_COLS.length + 5} className="muted" style={{ padding: 12 }}>
                    No runs match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
