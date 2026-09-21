const BASE = import.meta.env.VITE_API_BASE || "";

// The Error a failed response becomes: its message is the server's, and `status` / `body` let callers tell
// "not found" / "conflict" from a network failure (no status).
async function httpError(res) {
  let msg = `HTTP ${res.status}`;
  let body = null;
  try {
    body = await res.json();
    // GlobalExceptionHandler only wraps a few exception types as {error}; anything
    // else falls back to Spring Boot's default body ({timestamp,status,error,path,
    // message}), where the useful text is in `message` instead.
    if (body.error) msg = body.error;
    else if (body.message) msg = body.message;
  } catch (_) {}
  const err = new Error(msg);
  err.status = res.status;
  err.body = body;
  return err;
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw await httpError(res);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// A file the server sends as an attachment: { blob, filename } (the name the server chose, else `fallbackName`).
async function download(path, fallbackName) {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw await httpError(res);
  const named = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
  return { blob: await res.blob(), filename: named ? named[1] : fallbackName };
}

const queryString = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
  const qs = p.toString();
  return qs ? `?${qs}` : "";
};

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
  // Background jobs: kind = "run" | "run-all" | "pairs" | "ensemble". Starting returns the job at once (202);
  // a second start while one runs is refused with 409 and { activeJob } in err.body.
  startJob: (kind, body) => req(`/backtests/jobs/${kind}`, { method: "POST", body: JSON.stringify(body) }),
  getJob: (id) => req(`/backtests/jobs/${encodeURIComponent(id)}`),
  activeJobs: () => req("/backtests/jobs/active"),
  cancelJob: (id) => req(`/backtests/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  // One page of a run's trades. params: { symbol, side: "LONG"|"SHORT", sort, dir: "asc"|"desc", page, size }
  getTrades: (id, params = {}) => req(`/backtests/${id}/trades${queryString(params)}`),
  // Every trade matching the filter, not one page, as an Excel file. params: { symbol, side, sort, dir }
  exportTrades: (id, params = {}) => download(`/backtests/${id}/trades/export${queryString(params)}`, `trades-run-${id}.xlsx`),
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

  // Paper (demo-account) trading job: configure it, run/flatten it, and monitor what it did.
  liveStatus: () => req("/live/status"),
  liveConfig: () => req("/live/config"),
  saveLiveConfig: (settings) => req("/live/config", { method: "PUT", body: JSON.stringify(settings) }),
  liveRunNow: () => req("/live/run-now", { method: "POST" }),
  liveFlatten: () => req("/live/flatten", { method: "POST" }),
  liveStrategies: () => req("/live/strategies"),
  liveStrategy: (name, trades = 100) => req(`/live/strategies/${encodeURIComponent(name)}?trades=${trades}`),
  livePositions: () => req("/live/positions"),
  liveOrders: (page = 0, size = 50) => req(`/live/orders?page=${page}&size=${size}`),
  liveCycles: (page = 0, size = 30) => req(`/live/cycles?page=${page}&size=${size}`),
  liveEquity: (hours = 72) => req(`/live/equity?hours=${hours}`),

  // timeframe: "" / "AUTO" => each strategy on its own recommended frame; a Timeframe id pins all.
  scan: (symbols, includeFlat = false, timeframe = "") =>
    req(`/scan?includeFlat=${includeFlat}${timeframe && timeframe !== "AUTO" ? `&timeframe=${encodeURIComponent(timeframe)}` : ""}`, {
      method: "POST",
      // Body is optional on the backend; only send one when symbols are given so
      // the scan falls back to the full universe.
      ...(symbols && symbols.length ? { body: JSON.stringify(symbols) } : {}),
    }),
  signals: () => req("/signals"),

  // Auto trading: the job that sends strategy signals to ExecutionEngine as BUY / SELL commands — /api/autotrade/*
  autoTradeStatus: () => req("/autotrade/status"),
  enableAutoTrade: () => req("/autotrade/enable", { method: "POST" }),
  disableAutoTrade: () => req("/autotrade/disable", { method: "POST" }),
  // { quantity, orderType: "MKT"|"LMT", tif: "DAY"|"GTC", strategyNames, symbols, maxCommandsPerRun } — the switch is left as it is
  saveAutoTradeSettings: (settings) => req("/autotrade/settings", { method: "PUT", body: JSON.stringify(settings) }),
  autoTradeCommands: (page = 0, size = 50) => req(`/autotrade/commands?page=${page}&size=${size}`),
  // The Scanner's "Forward" button: one signal, now, with the saved quantity. executionStatus says whether ExecutionEngine is configured.
  executionStatus: () => req("/autotrade/status"),
  sendSignal: (signal) => req("/autotrade/forward", { method: "POST", body: JSON.stringify(signal) }),
};
