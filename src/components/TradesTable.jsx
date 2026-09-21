import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt, cls, fmtDateTime, fmtMoney, fmtPx } from "../api/format";
import { saveFile } from "../api/saveFile";

const PAGE_SIZES = [25, 50, 100, 200];
const TEXT_SORTS = new Set(["symbol", "side"]);

// [sort key or null, label, tooltip]
const COLS = [
  ["symbol", "Symbol", null],
  ["side", "Side", null],
  ["entryDate", "Entry", "Open time of the bar the position starts earning on (= the close of the bar before it)."],
  ["entryPx", "Entry price", "Close at which the position is opened."],
  ["exitDate", "Exit", "Open time of the first bar the position no longer earns on."],
  ["exitPx", "Exit price", "Close at which the position is closed. For a trade still open, the last close."],
  ["bars", "Bars", "Bars the position was held."],
  [null, "Shares", "Position size at entry: capital × exposure ÷ entry price (fractional shares)."],
  ["grossPct", "Gross %", "Price P&L before costs, as a % of the position."],
  ["commission", "Commission $", "Commission paid on the entry and exit fills."],
  [null, "Slippage $", "Slippage paid on the entry and exit fills."],
  ["netPct", "Net %", "Gross % minus commission and slippage, as a % of the position."],
  ["netPnl", "Net P&L $", "Net profit on the run's starting capital, treating the symbol as if it were traded alone."],
  ["contribPct", "Portfolio contrib. %", "This trade's share of the blended portfolio's total return (each symbol is an equal slice)."],
];

const shares = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function TradesTable({ runId, tradeCount, symbols, symbol, onSymbolChange }) {
  const [side, setSide] = useState("");
  const [sort, setSort] = useState({ key: "entryDate", dir: "desc" });
  const [size, setSize] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);            // bumped to retry after an error
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // The page is remembered together with the filter it belongs to, so changing any filter
  // (or the symbol from the results table above) falls back to page 1 without a second fetch.
  const sig = [symbol, side, sort.key, sort.dir, size].join("|");
  const [pg, setPg] = useState({ sig, page: 0 });
  const page = pg.sig === sig ? pg.page : 0;
  const goto = (p) => setPg({ sig, page: p });

  useEffect(() => {
    if (!tradeCount) return undefined;
    let cancelled = false;
    setLoading(true); setError(null);
    api.getTrades(runId, { symbol, side, sort: sort.key, dir: sort.dir, page, size })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };   // a slower, older response must never overwrite a newer one
  }, [runId, tradeCount, symbol, side, sort.key, sort.dir, page, size, tick]);

  // defensive: if the data shrank under an open page, land on the last page that exists
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > 0)
      goto(Math.max(0, Math.ceil(data.total / data.size) - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Every trade matching the filters, in the table's sort order (not just the visible page).
  const exportExcel = async () => {
    setExporting(true); setExportError(null);
    try {
      const { blob, filename } = await api.exportTrades(runId, { symbol, side, sort: sort.key, dir: sort.dir });
      saveFile(blob, filename);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  };

  if (!tradeCount) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Trades</h3>
        <div className="muted">This run made no trades.</div>
      </div>
    );
  }

  const clickSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
                                   : { key, dir: TEXT_SORTS.has(key) ? "asc" : "desc" }));
  const arrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.size || size)));
  const from = total === 0 ? 0 : page * (data?.size || size) + 1;
  const to = Math.min(total, (page + 1) * (data?.size || size));
  const s = data?.summary;
  const filtered = Boolean(symbol || side);

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        Trades <span className="count">· {tradeCount.toLocaleString("en-US")} in this run</span>
      </h3>

      <div className="filters">
        <div className="field">
          <label>Symbol</label>
          <select value={symbol} onChange={(e) => onSymbolChange(e.target.value)}>
            <option value="">All symbols</option>
            {symbols.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">Long &amp; short</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>
        <div className="field">
          <label>Rows per page</label>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {filtered && (
          <button className="secondary xs" onClick={() => { onSymbolChange(""); setSide(""); }}>clear filters</button>
        )}
        <span className="count">click a header to sort · hover for what it means</span>
        <button className="secondary xs" style={{ marginLeft: "auto" }} disabled={exporting || !total} onClick={exportExcel}
                title="Download all trades matching the filters, in this sort order, as an Excel file (with a summary sheet)">
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>

      {s && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span><b>{s.trades.toLocaleString("en-US")}</b> trade{s.trades === 1 ? "" : "s"}{filtered ? " match" : ""}
            {" "}({s.longs.toLocaleString("en-US")} long / {s.shorts.toLocaleString("en-US")} short)</span>
          <span>win rate <b className={cls(s.winRatePct - 50)}>{fmt(s.winRatePct, 1)}%</b></span>
          <span>net P&amp;L <b className={cls(s.netPnl)}>{fmtMoney(s.netPnl)}</b></span>
          <span>commission <b>{fmtMoney(s.commission)}</b></span>
          <span>slippage <b>{fmtMoney(s.slippage)}</b></span>
          <span>avg net <b className={cls(s.avgNetPct)}>{fmt(s.avgNetPct)}%</b></span>
          <span>best <b className="pos">{fmt(s.bestNetPct)}%</b> · worst <b className="neg">{fmt(s.worstNetPct)}%</b></span>
        </div>
      )}

      {exportError && (
        <div className="neg" style={{ marginBottom: 8 }}>
          Could not export trades: {exportError}{" "}
          <button className="secondary xs" onClick={exportExcel}>retry</button>
        </div>
      )}

      {error && (
        <div className="neg" style={{ marginBottom: 8 }}>
          Could not load trades: {error}{" "}
          <button className="secondary xs" onClick={() => setTick((t) => t + 1)}>retry</button>
        </div>
      )}

      <div className="table-scroll" style={{ maxHeight: 560, opacity: loading && data ? 0.55 : 1, transition: "opacity .15s" }}>
        <table>
          <thead>
            <tr>
              {COLS.map(([key, label, tip]) => (
                key
                  ? <th key={label} className="row-click" title={tip || undefined} onClick={() => clickSort(key)}>{label}{arrow(key)}</th>
                  : <th key={label} title={tip || undefined}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data && data.items.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td><span className={`badge ${t.side}`}>{t.side}</span></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(t.entryDate)}</td>
                <td>{fmtPx(t.entryPx)}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {fmtDateTime(t.exitDate)}
                  {t.open && <span className="tag" style={{ marginLeft: 6 }} title="Still open on the last bar: marked at the last close, no exit cost yet">open</span>}
                </td>
                <td>{fmtPx(t.exitPx)}</td>
                <td>{t.bars}</td>
                <td>{shares(t.shares)}</td>
                <td className={cls(t.grossPct)}>{fmt(t.grossPct)}</td>
                <td>{fmtMoney(t.commission)}</td>
                <td>{fmtMoney(t.slippage)}</td>
                <td className={cls(t.netPct)}>{fmt(t.netPct)}</td>
                <td className={cls(t.netPnl)}>{fmtMoney(t.netPnl)}</td>
                <td className={`muted ${cls(t.contribPct)}`}>{fmt(t.contribPct, 3)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && !loading && (
              <tr><td colSpan={COLS.length} className="empty">No trades match these filters.</td></tr>
            )}
            {!data && (
              <tr><td colSpan={COLS.length} className="empty">{loading ? "Loading trades…" : "—"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button className="secondary xs" disabled={page <= 0 || loading} onClick={() => goto(0)}>« first</button>
        <button className="secondary xs" disabled={page <= 0 || loading} onClick={() => goto(page - 1)}>‹ prev</button>
        <span className="muted" style={{ fontSize: 13 }}>
          {total === 0 ? "0 trades" : `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}
          {" · "}page {page + 1} of {pages}
        </span>
        <button className="secondary xs" disabled={page + 1 >= pages || loading} onClick={() => goto(page + 1)}>next ›</button>
        <button className="secondary xs" disabled={page + 1 >= pages || loading} onClick={() => goto(pages - 1)}>last »</button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Dollar figures treat each trade as if its symbol were traded alone with the run's full starting
        capital (position = capital × exposure). Commission and slippage are the run's settings applied to the
        entry and exit fills (a flip pays the exit half on one trade and the entry half on the next; a trade still
        open has paid only its entry). For each symbol the net P&amp;L of its trades adds up to its total return
        above. The blended portfolio gives every symbol an equal slice, which is the "Portfolio contrib." column.
      </p>
    </div>
  );
}
