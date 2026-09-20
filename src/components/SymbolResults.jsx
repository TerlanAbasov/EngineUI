import { useMemo, useState } from "react";
import { fmt, cls, METRIC_HELP } from "../api/format";

// [metric key, label]
const COLS = [
  ["totalReturnPct", "Total return %"],
  ["cagrPct", "Annualised return %"],
  ["sharpe", "Sharpe"],
  ["maxDrawdownPct", "Max DD %"],
  ["annVolPct", "Ann. vol %"],
  ["winRatePct", "Win rate %"],
  ["profitFactor", "Profit factor"],
  ["exposurePct", "Exposure %"],
  ["trades", "Trades"],
];
const INT_COLS = new Set(["trades"]);
const COL_HELP = {
  cagrPct: "Total return annualised over the period this symbol traded (compound annual growth rate).",
  ...METRIC_HELP,
};
const PORTFOLIO = "__portfolio__";

const valueOf = (row, key) => (key.startsWith("y:") ? row.yearly?.[key.slice(2)] : row.metrics?.[key]);

/**
 * One row per symbol (plus the blended portfolio): its standalone result and its return in each
 * calendar year. Clicking a symbol selects it, which filters the trades table below to that symbol.
 */
export default function SymbolResults({ result, selected, onSelect }) {
  const [sort, setSort] = useState({ key: "totalReturnPct", dir: "desc" });

  const symbolRows = useMemo(
    () => (result.symbolResults || []).map((r) => ({ id: r.symbol, label: r.symbol, metrics: r.metrics, yearly: r.yearlyReturnsPct })),
    [result.symbolResults]);
  const portfolio = { id: PORTFOLIO, label: "Portfolio (blended)", metrics: result.metrics, yearly: result.yearlyReturnsPct };

  const years = useMemo(() => {
    const ys = new Set(Object.keys(result.yearlyReturnsPct || {}));
    symbolRows.forEach((r) => Object.keys(r.yearly || {}).forEach((y) => ys.add(y)));
    return Array.from(ys).sort();
  }, [symbolRows, result.yearlyReturnsPct]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    // symbols without a value for the sort column (e.g. no data that year) always sink to the bottom
    return [...symbolRows].sort((a, b) => {
      const va = valueOf(a, sort.key), vb = valueOf(b, sort.key);
      const na = va == null || Number.isNaN(va), nb = vb == null || Number.isNaN(vb);
      if (na || nb) return na === nb ? a.label.localeCompare(b.label) : na ? 1 : -1;
      return va === vb ? a.label.localeCompare(b.label) : (va - vb) * dir;
    });
  }, [symbolRows, sort]);

  // Runs saved before per-symbol results existed only have each symbol's total return.
  if (!symbolRows.length) {
    const legacy = Object.entries(result.symbolReturnsPct || {}).sort((a, b) => b[1] - a[1]);
    if (!legacy.length) return null;
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Results by symbol</h3>
        <table>
          <thead><tr><th>Symbol</th><th style={{ textAlign: "right" }}>Total return %</th></tr></thead>
          <tbody>
            {legacy.map(([sym, pct]) => (
              <tr key={sym}><td>{sym}</td><td className={cls(pct)} style={{ textAlign: "right" }}>{fmt(pct)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          This run was saved before full per-symbol results existed, so only each symbol's total return is
          available. Re-run the backtest to get annualised return, yearly returns, risk figures and the detailed trade log.
        </p>
      </div>
    );
  }

  const clickSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const arrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const cell = (row, key) => {
    const v = valueOf(row, key);
    const isYear = key.startsWith("y:");
    const colored = isYear || ["totalReturnPct", "cagrPct", "sharpe"].includes(key);
    return (
      <td key={key} className={colored ? cls(v) : undefined} style={{ textAlign: "right" }}>
        {fmt(v, INT_COLS.has(key) ? 0 : 2)}
      </td>
    );
  };

  const renderRow = (row, isPortfolio) => {
    const isSelected = isPortfolio ? !selected : selected === row.id;
    return (
      <tr key={row.id} className="row-click" aria-selected={isSelected}
          title={isPortfolio ? "Show the trades of every symbol" : `Show ${row.label}'s trades`}
          onClick={() => onSelect(isPortfolio || selected === row.id ? "" : row.id)}
          style={{
            ...(isSelected ? { background: "#161d29" } : null),
            ...(isPortfolio ? { fontWeight: 700 } : null),
          }}>
        <td style={{ fontWeight: 600 }}>{row.label}</td>
        {COLS.map(([k]) => cell(row, k))}
        {years.map((y) => cell(row, `y:${y}`))}
      </tr>
    );
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        Results by symbol <span className="count">· click a symbol to see its trades below</span>
      </h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              {COLS.map(([k, l]) => (
                <th key={k} className="row-click" style={{ textAlign: "right" }} title={COL_HELP[k]}
                    onClick={() => clickSort(k)}>{l}{arrow(k)}</th>
              ))}
              {years.map((y) => (
                <th key={y} className="row-click" style={{ textAlign: "right" }}
                    title="Return in this calendar year (UTC), % of starting capital. The first and last year are usually partial."
                    onClick={() => clickSort(`y:${y}`)}>{y} %{arrow(`y:${y}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderRow(portfolio, true)}
            {sorted.map((r) => renderRow(r, false))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Each symbol row is that stock's own result, as if it had been backtested alone with this run's settings
        and the full starting capital — so its total return, drawdown and Sharpe are its own, not its slice of
        the portfolio. The blended portfolio gives every symbol an equal slice for as long as it has data, so its
        total return is the average of the symbols' total returns (a symbol that starts later, such as a recent
        listing, only joins the mix from its first bar, which is why the two can differ a little). Yearly figures
        add up to the total return (the first and last calendar year are usually partial).
      </p>
    </div>
  );
}
