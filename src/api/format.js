export const fmt = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d);

export const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

// Money with thousands separators, e.g. 1,234.50 / -87.00 (no currency symbol: the run's currency is implicit).
const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoney = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : MONEY.format(v);

// Share prices: 2 decimals normally, 4 below $10 so cheap stocks don't collapse to a couple of ticks.
export const fmtPx = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(Math.abs(v) < 10 ? 4 : 2);

// The backend serialises every timestamp as an ISO-8601 instant (e.g.
// "2020-01-02T00:00:00Z") since the bar-interval-timestamps migration. Render the
// calendar date, and only add the clock when the bar isn't at UTC midnight
// (intraday timeframes like 1Hour / 15Min).
export const fmtDate = (v) => {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString().slice(0, 10);
};

export const fmtDateTime = (v) => {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
};

// Metric keys shown in the KPI grid / leaderboard, in display order.
export const KPI_KEYS = [
  ["totalReturnPct", "Total Return %"],
  ["cagrPct", "CAGR %"],
  ["sharpe", "Sharpe"],
  ["sortino", "Sortino"],
  ["calmar", "Calmar"],
  ["maxDrawdownPct", "Max DD %"],
  ["annVolPct", "Ann Vol %"],
  ["exposurePct", "Exposure %"],
];

export const TRADE_KEYS = [
  ["trades", "Trades"],
  ["winRatePct", "Win Rate %"],
  ["profitFactor", "Profit Factor"],
  ["avgWinPct", "Avg Win %"],
  ["avgLossPct", "Avg Loss %"],
  ["expectancyPct", "Expectancy %"],
  ["avgBarsHeld", "Avg Bars Held"],
  ["bestTradePct", "Best Trade %"],
  ["worstTradePct", "Worst Trade %"],
  ["maxWinStreak", "Max Win Streak"],
  ["maxLossStreak", "Max Loss Streak"],
  ["tradesPerYear", "Trades / Year"],
];

// Long vs short operation breakdown — rendered as a two-column table.
// [metricLabel, longKey, shortKey, decimals]
export const LONGSHORT_ROWS = [
  ["Operations", "longOps", "shortOps", 0],
  ["Win Rate %", "longWinRatePct", "shortWinRatePct", 1],
  ["P&L %", "longPnlPct", "shortPnlPct", 2],
  ["Exposure %", "longExposurePct", "shortExposurePct", 1],
];

// Risk / robustness metrics for the secondary KPI strip.
export const RISK_KEYS = [
  ["var95Pct", "VaR 95% (daily)"],
  ["cvar95Pct", "CVaR 95% (daily)"],
  ["ulcerIndex", "Ulcer Index"],
  ["gainToPain", "Gain / Pain"],
  ["beta", "Beta"],
  ["alphaAnnPct", "Alpha % (ann)"],
  ["benchCorr", "Corr vs B&H"],
  ["annTurnoverPct", "Ann Turnover %"],
  ["maxDrawdownDays", "Max DD (bars)"],
  ["timeInDrawdownPct", "Time in DD %"],
];

// Fallback list if GET /backtests/timeframes is unavailable. Mirrors engine/Timeframe.java.
export const TIMEFRAMES = [
  { id: "NATIVE", label: "Native", nativeFrame: true },
  { id: "M5", label: "5 Min", nativeFrame: false },
  { id: "M15", label: "15 Min", nativeFrame: false },
  { id: "M30", label: "30 Min", nativeFrame: false },
  { id: "H1", label: "1 Hour", nativeFrame: false },
  { id: "H2", label: "2 Hour", nativeFrame: false },
  { id: "H3", label: "3 Hour", nativeFrame: false },
  { id: "H4", label: "4 Hour", nativeFrame: false },
  { id: "H6", label: "6 Hour", nativeFrame: false },
  { id: "H8", label: "8 Hour", nativeFrame: false },
  { id: "H12", label: "12 Hour", nativeFrame: false },
  { id: "D1", label: "1 Day", nativeFrame: false },
  { id: "W1", label: "1 Week", nativeFrame: false },
  { id: "MN", label: "1 Month", nativeFrame: false },
  { id: "Q1", label: "1 Quarter", nativeFrame: false },
  { id: "Y1", label: "1 Year", nativeFrame: false },
];

// Plain-English explanation for each metric key — shown as a hover tooltip on
// column headers and KPI labels.
export const METRIC_HELP = {
  totalReturnPct: "Total return over the whole test, on starting capital (≈ sum of every trade's P&L).",
  cagrPct: "Compound annual growth rate — the total return expressed as a per-year rate.",
  sharpe: "Risk-adjusted return: average return ÷ volatility, annualised. >1 good, >2 excellent.",
  sortino: "Like Sharpe, but only downside (losing) volatility is penalised.",
  calmar: "Annualised return ÷ maximum drawdown. Higher = more return per unit of pain.",
  maxDrawdownPct: "Largest peak-to-trough drop in equity during the test.",
  maxDrawdownDays: "Longest stretch (in bars) spent below a previous equity high.",
  timeInDrawdownPct: "Share of the test spent below a previous equity high.",
  annVolPct: "Annualised standard deviation of returns — how bumpy the ride is.",
  exposurePct: "Share of bars holding a position (long or short).",
  longExposurePct: "Share of bars holding a long position.",
  shortExposurePct: "Share of bars holding a short position.",
  winRatePct: "Share of closed trades that made money.",
  profitFactor: "Gross profit ÷ gross loss. Above 1 means profitable overall.",
  expectancyPct: "Average profit/loss per trade.",
  avgWinPct: "Average gain on winning trades.",
  avgLossPct: "Average loss on losing trades.",
  avgBarsHeld: "Average holding time per trade, in bars.",
  bestTradePct: "Biggest single-trade gain.",
  worstTradePct: "Biggest single-trade loss.",
  maxWinStreak: "Longest run of consecutive winning trades.",
  maxLossStreak: "Longest run of consecutive losing trades.",
  tradesPerYear: "Average number of trades per year.",
  trades: "Number of closed round-trip trades.",
  longOps: "Number of closed long trades.",
  shortOps: "Number of closed short trades.",
  ulcerIndex: "Depth-and-duration measure of drawdown pain (lower is better).",
  gainToPain: "Sum of up-bar returns ÷ sum of down-bar returns.",
  var95Pct: "Daily loss not exceeded on 95% of days (historical).",
  cvar95Pct: "Average loss on the worst 5% of days.",
  beta: "Sensitivity to buy & hold (1 = moves one-for-one with it).",
  alphaAnnPct: "Annualised return not explained by the buy & hold benchmark.",
  benchCorr: "Correlation of daily returns with buy & hold.",
  annTurnoverPct: "Position turnover per year (200% = the book rotates twice).",
  longPnlPct: "Total P&L from long trades.",
  shortPnlPct: "Total P&L from short trades.",
  longWinRatePct: "Win rate of long trades only.",
  shortWinRatePct: "Win rate of short trades only.",
  longAvgBarsHeld: "Average holding time of long trades, in bars.",
  shortAvgBarsHeld: "Average holding time of short trades, in bars.",
};

// Downsample long arrays for charting.
export function downsample(arr, max = 400) {
  if (!arr || arr.length <= max) return arr || [];
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

/** 75_000 ms -> "1:15"; an hour or more -> "1:02:03". */
export const fmtDuration = (ms) => {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};
