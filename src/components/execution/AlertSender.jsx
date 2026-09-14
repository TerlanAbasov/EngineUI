import { useState } from "react";
import { execApi } from "../../api/executionClient";

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const initialForm = {
  ticker: "", side: "buy", peerTicker: "", assetClass: "STOCK", strategy: "",
  routing: "", exchange: "SMART", interval: "5", time: nowIso(), timenow: nowIso(),
  volume: "0", close: "", high: "", low: "", open: "", quote: "USD", base: "",
};

// Mirrors TVAlertDto exactly — this is what /alerts/tv-hook expects (all string fields,
// same shape TradingView's own webhook sends). A few backend parsing rules that aren't
// obvious from the field names alone (from AlertMapper.java):
//  - action is derived from `buy`/`sell`: exactly one of them must be "1" or "true",
//    never both — the form below only ever sends one.
//  - `time`/`timenow` must parse as ISO-8601 instants (e.g. 2026-01-30T10:09:07Z).
//  - `interval` accepts minutes as a bare number, or "5S"/"D"/"W"/"M" for seconds/day/week/month.
export default function AlertSender({ onResult }) {
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.ticker.trim() || !form.strategy.trim()) return;
    setBusy(true);
    try {
      const dto = {
        ticker: form.ticker.trim().toUpperCase(),
        buy: form.side === "buy" ? "1" : "",
        sell: form.side === "sell" ? "1" : "",
        peerTicker: form.peerTicker.trim() || null,
        assetClass: form.assetClass,
        strategy: form.strategy.trim(),
        routing: form.routing.trim() || null,
        exchange: form.exchange.trim() || null,
        interval: form.interval.trim(),
        time: form.time.trim(),
        timenow: form.timenow.trim(),
        volume: form.volume.trim(),
        close: form.close.trim(),
        high: form.high.trim(),
        low: form.low.trim(),
        open: form.open.trim(),
        quote: form.quote.trim() || null,
        base: form.base.trim() || null,
      };
      const message = await execApi.sendAlert(dto);
      onResult({ label: `Alert ${dto.ticker} (${form.side.toUpperCase()})`, message });
    } catch (e) {
      onResult({ label: `Alert ${form.ticker}`, message: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Send Alert</h3>
      <div className="banner">
        Posts directly to <code>/alerts/tv-hook</code>, the same endpoint TradingView's
        webhook calls — useful for testing the strategy pipeline manually. Processing is
        asynchronous: a successful response here only means the alert was accepted and
        queued, not that it traded. The <b>strategy</b> name must exactly match an
        existing strategy row in ExecutionEngine's database or the alert fails silently
        (no strategy list is exposed over HTTP to verify this against).
      </div>

      <div className="form-grid">
        <div>
          <label>Ticker</label>
          <input style={{ width: "100%" }} placeholder="AAPL" value={form.ticker}
                 onChange={(e) => upd("ticker", e.target.value.toUpperCase())} />
        </div>
        <div>
          <label>Side</label>
          <select value={form.side} onChange={(e) => upd("side", e.target.value)} style={{ width: "100%" }}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label>Strategy <span className="muted" style={{ textTransform: "none" }}>(must exist already)</span></label>
          <input style={{ width: "100%" }} value={form.strategy} onChange={(e) => upd("strategy", e.target.value)} />
        </div>
        <div>
          <label>Asset class</label>
          <select value={form.assetClass} onChange={(e) => upd("assetClass", e.target.value)} style={{ width: "100%" }}>
            <option value="STOCK">STOCK</option>
            <option value="CRYPTO">CRYPTO</option>
          </select>
        </div>
        <div>
          <label>Exchange</label>
          <input style={{ width: "100%" }} value={form.exchange} onChange={(e) => upd("exchange", e.target.value)} />
        </div>
        <div>
          <label>Interval <span className="muted" style={{ textTransform: "none" }}>(minutes, or 5S/D/W/M)</span></label>
          <input style={{ width: "100%" }} value={form.interval} onChange={(e) => upd("interval", e.target.value)} />
        </div>
        <div>
          <label>Open</label>
          <input type="number" step="any" style={{ width: "100%" }} value={form.open} onChange={(e) => upd("open", e.target.value)} />
        </div>
        <div>
          <label>High</label>
          <input type="number" step="any" style={{ width: "100%" }} value={form.high} onChange={(e) => upd("high", e.target.value)} />
        </div>
        <div>
          <label>Low</label>
          <input type="number" step="any" style={{ width: "100%" }} value={form.low} onChange={(e) => upd("low", e.target.value)} />
        </div>
        <div>
          <label>Close</label>
          <input type="number" step="any" style={{ width: "100%" }} value={form.close} onChange={(e) => upd("close", e.target.value)} />
        </div>
        <div>
          <label>Volume</label>
          <input type="number" step="any" style={{ width: "100%" }} value={form.volume} onChange={(e) => upd("volume", e.target.value)} />
        </div>
        <div>
          <label>Quote currency</label>
          <input style={{ width: "100%" }} value={form.quote} onChange={(e) => upd("quote", e.target.value)} />
        </div>
        <div>
          <label>Peer ticker <span className="muted" style={{ textTransform: "none" }}>(optional, pairs)</span></label>
          <input style={{ width: "100%" }} value={form.peerTicker} onChange={(e) => upd("peerTicker", e.target.value.toUpperCase())} />
        </div>
        <div>
          <label>Bar time (ISO)</label>
          <input style={{ width: "100%" }} value={form.time} onChange={(e) => upd("time", e.target.value)} />
        </div>
        <div>
          <label>Generated time (ISO)</label>
          <input style={{ width: "100%" }} value={form.timenow} onChange={(e) => upd("timenow", e.target.value)} />
        </div>
        <div>
          <button disabled={busy || !form.ticker.trim() || !form.strategy.trim()} onClick={submit} style={{ width: "100%" }}>
            {busy ? "Sending…" : "Send alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
