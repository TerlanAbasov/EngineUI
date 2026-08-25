export const fmt = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d);

export const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

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
];

// Downsample long arrays for charting.
export function downsample(arr, max = 400) {
  if (!arr || arr.length <= max) return arr || [];
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}
