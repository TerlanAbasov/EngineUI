const BASE = import.meta.env.VITE_API_BASE || "";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      // GlobalExceptionHandler only wraps a few exception types as {error}; anything
      // else falls back to Spring Boot's default body ({timestamp,status,error,path,
      // message}), where the useful text is in `message` instead.
      if (body.error) msg = body.error;
      else if (body.message) msg = body.message;
    } catch (_) {}
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  strategies: (opts = {}) => req(`/strategies${opts.includeArchived ? "?includeArchived=true" : ""}`),
  strategy: (name) => req(`/strategies/${encodeURIComponent(name)}`),
  setEnabled: (name, enabled) =>
    req(`/strategies/${encodeURIComponent(name)}/enabled?enabled=${enabled}`, { method: "PUT" }),
  setStrategyParams: (name, params) =>
    req(`/strategies/${encodeURIComponent(name)}/params`, { method: "PUT", body: JSON.stringify(params) }),
  resetStrategyParams: (name) =>
    req(`/strategies/${encodeURIComponent(name)}/params`, { method: "DELETE" }),
  setStrategyControls: (name, controls) =>
    req(`/strategies/${encodeURIComponent(name)}/controls`, { method: "PUT", body: JSON.stringify(controls) }),
  unarchiveAllStrategies: () => req("/strategies/unarchive-all", { method: "POST" }),
  optimizeStrategy: (name, body) =>
    req(`/strategies/${encodeURIComponent(name)}/optimize`, { method: "POST", body: JSON.stringify(body) }),
  // finds the best timeframe/stop-loss%/take-profit% for one strategy; does not save it
  optimizeRiskDefaults: (name, body) =>
    req(`/strategies/${encodeURIComponent(name)}/optimize-risk-defaults`, { method: "POST", body: JSON.stringify(body) }),
  // runs the risk-default sweep for every enabled strategy and saves each winner
  optimizeRiskDefaultsBulk: (body) =>
    req("/strategies/optimize-risk-defaults/bulk", { method: "POST", body: JSON.stringify(body) }),

  universe: () => req("/universe"),
  setUniverse: (symbols) => req("/universe", { method: "PUT", body: JSON.stringify(symbols) }),
  addUniverse: (symbols) => req("/universe", { method: "POST", body: JSON.stringify(symbols) }),
  removeUniverse: (symbol) => req(`/universe/${encodeURIComponent(symbol)}`, { method: "DELETE" }),

  source: () => req("/market-data/source"),
  dataSymbols: () => req("/market-data/symbols"),
  priceBars: ({ symbol, timeframe, start, end, limit } = {}) => {
    const p = new URLSearchParams({ symbol });
    if (timeframe) p.set("timeframe", timeframe);
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (limit) p.set("limit", limit);
    return req(`/market-data/bars?${p.toString()}`);
  },
  // timeframe blank/"AUTO" => each strategy on its own recommended frame
  chartSignals: ({ symbol, timeframe, strategies, limit } = {}) => {
    const p = new URLSearchParams({ symbol, strategies });
    if (timeframe) p.set("timeframe", timeframe);
    if (limit) p.set("limit", limit);
    return req(`/signals/chart?${p.toString()}`);
  },
  pull: (symbols) =>
    req(`/market-data/pull?symbols=${symbols.map(encodeURIComponent).join(",")}`, { method: "POST" }),

  backtest: (body) => req("/backtests", { method: "POST", body: JSON.stringify(body) }),
  runAll: (body) => req("/backtests/run-all", { method: "POST", body: JSON.stringify(body) }),
  pairs: (body) => req("/backtests/pairs", { method: "POST", body: JSON.stringify(body) }),
  ensemble: (body) => req("/backtests/ensemble", { method: "POST", body: JSON.stringify(body) }),
  getRun: (id) => req(`/backtests/${id}`),
  // One page of a run's trades. params: { symbol, side: "LONG"|"SHORT", sort, dir: "asc"|"desc", page, size }
  getTrades: (id, params = {}) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    const qs = p.toString();
    return req(`/backtests/${id}/trades${qs ? `?${qs}` : ""}`);
  },
  // opts: { strategy, minReturn, minCagr, minSharpe, minProfitFactor, minWinRate, maxDrawdown, minTrades, sort, dir, limit }
  listRuns: (opts = {}) => {
    const p = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v))) p.set(k, v);
    });
    const qs = p.toString();
    return req(`/backtests${qs ? `?${qs}` : ""}`);
  },
  deleteRun: (id) => req(`/backtests/${id}`, { method: "DELETE" }),
  // { keep, keepPct, recentRuns, by: "totalReturnPct"|"sharpe", mode: "archive"|"disable"|"delete" }
  pruneHistory: (opts = {}) => {
    const p = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
    return req(`/backtests/prune?${p.toString()}`, { method: "POST" });
  },
  backtestTimeframes: () => req("/backtests/timeframes"),

  // timeframe: "" / "AUTO" => each strategy on its own recommended frame; a Timeframe id pins all.
  scan: (symbols, includeFlat = false, timeframe = "") =>
    req(`/scan?includeFlat=${includeFlat}${timeframe && timeframe !== "AUTO" ? `&timeframe=${encodeURIComponent(timeframe)}` : ""}`, {
      method: "POST",
      // Body is optional on the backend; only send one when symbols are given so
      // the scan falls back to the full universe.
      ...(symbols && symbols.length ? { body: JSON.stringify(symbols) } : {}),
    }),
  signals: () => req("/signals"),

  // ExecutionEngine forwarding — POST /api/execution/{status,send}
  executionStatus: () => req("/execution/status"),
  sendSignal: (signal) => req("/execution/send", { method: "POST", body: JSON.stringify(signal) }),
};
