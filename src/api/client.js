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
      if (body.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  strategies: () => req("/strategies"),
  setEnabled: (name, enabled) =>
    req(`/strategies/${encodeURIComponent(name)}/enabled?enabled=${enabled}`, { method: "PUT" }),

  universe: () => req("/universe"),
  setUniverse: (symbols) => req("/universe", { method: "PUT", body: JSON.stringify(symbols) }),

  source: () => req("/market-data/source"),
  pull: (symbols) =>
    req(`/market-data/pull?symbols=${symbols.map(encodeURIComponent).join(",")}`, { method: "POST" }),

  backtest: (body) => req("/backtests", { method: "POST", body: JSON.stringify(body) }),
  runAll: (body) => req("/backtests/run-all", { method: "POST", body: JSON.stringify(body) }),
  pairs: (body) => req("/backtests/pairs", { method: "POST", body: JSON.stringify(body) }),
  getRun: (id) => req(`/backtests/${id}`),
  listRuns: (strategy) => req(`/backtests${strategy ? `?strategy=${encodeURIComponent(strategy)}` : ""}`),

  scan: (symbols, includeFlat = false) =>
    req(`/scan?includeFlat=${includeFlat}`, {
      method: "POST",
      body: JSON.stringify(symbols && symbols.length ? symbols : null),
    }),
  signals: () => req("/signals"),
};
