import { useState } from "react";
import { execApi, IB_ACTIONS, IB_ORDER_TYPES, IB_TIME_IN_FORCE } from "../../api/executionClient";

const COMMANDS = [
  ["BUY", "Buy"],
  ["SELL", "Sell"],
  ["CLOSE_ALL", "Close all positions"],
  ["CANCEL_ORDER", "Cancel order"],
  ["CANCEL_OPEN_ORDERS", "Cancel all open orders"],
];

// buy()/sell()/closeAllPositions() are currently empty stub methods in both
// StockTradeExecutor and CryptoTradeExecutor — the request is accepted and dispatched,
// but no order is actually placed yet. Surfaced here so nobody mistakes "request
// accepted" for "order placed".
const STUBBED = new Set(["BUY", "SELL", "CLOSE_ALL"]);

const initialForm = { identifier: "", strategy: "", action: "BUY", quantity: "", orderType: "MKT", limitPrice: "", tif: "DAY" };

export default function TradeConsole({ onResult }) {
  const [command, setCommand] = useState("BUY");
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const needsSymbol = command === "BUY" || command === "SELL" || command === "CANCEL_ORDER";
  const needsOrderFields = command === "BUY" || command === "SELL";
  const symbolOptional = command === "CLOSE_ALL";
  const isDestructive = command === "CLOSE_ALL" || command === "CANCEL_OPEN_ORDERS" || command === "CANCEL_ORDER";

  const baseLabel = COMMANDS.find(([id]) => id === command)?.[1] || command;
  // Log label — includes the symbol/id when one was given, for a legible activity log.
  const label = () => {
    if ((command === "BUY" || command === "SELL" || command === "CANCEL_ORDER") && form.identifier.trim()) {
      return `${baseLabel} ${form.identifier.trim()}`;
    }
    return baseLabel;
  };

  const submit = async () => {
    if (needsSymbol && command !== "CANCEL_ORDER" && !form.identifier.trim()) return;
    if (command === "CANCEL_ORDER" && !form.identifier.trim()) return;

    if (isDestructive) {
      const what =
        command === "CLOSE_ALL" ? `close ${form.identifier.trim() ? `the ${form.identifier.trim()} position` : "ALL open positions"}`
          : command === "CANCEL_OPEN_ORDERS" ? "cancel ALL open orders"
            : `cancel order/orders for "${form.identifier.trim()}"`;
      if (!window.confirm(`This will ${what} on the live paper account. Continue?`)) return;
    }

    setBusy(true);
    try {
      const dto = { command };
      if (needsSymbol || symbolOptional) dto.identifier = form.identifier.trim() || null;
      if (needsOrderFields) {
        dto.action = form.action;
        dto.orderType = form.orderType;
        dto.tif = form.tif;
        if (form.strategy.trim()) dto.strategy = form.strategy.trim();
        if (form.quantity !== "") dto.quantity = Number(form.quantity);
        if (form.orderType === "LMT" && form.limitPrice !== "") dto.limitPrice = Number(form.limitPrice);
      }
      const message = await execApi.sendCommand(dto);
      onResult({ label: label(), message });
    } catch (e) {
      onResult({ label: label(), message: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Trade Console</h3>
      {STUBBED.has(command) && (
        <div className="banner warn">
          ⚠ Not yet implemented on the backend — <code>buy()</code> / <code>sell()</code> /
          <code>closeAllPositions()</code> are stub methods today. This request will be
          accepted and logged, but no order will actually be placed until that logic is
          built.
        </div>
      )}

      <div className="form-grid">
        <div>
          <label>Command</label>
          <select value={command} onChange={(e) => setCommand(e.target.value)} style={{ width: "100%" }}>
            {COMMANDS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </div>

        {(needsSymbol || symbolOptional) && (
          <div>
            <label>
              {command === "CANCEL_ORDER" ? "Order ID or symbol" : "Symbol"}
              {symbolOptional && <span className="muted" style={{ textTransform: "none" }}> (optional — blank = all)</span>}
            </label>
            <input style={{ width: "100%" }} placeholder={command === "CANCEL_ORDER" ? "e.g. 1007 or AAPL" : "e.g. AAPL"}
                   value={form.identifier} onChange={(e) => upd("identifier", e.target.value.toUpperCase())} />
          </div>
        )}

        {needsOrderFields && (
          <>
            <div>
              <label>Strategy <span className="muted" style={{ textTransform: "none" }}>(optional)</span></label>
              <input style={{ width: "100%" }} value={form.strategy} onChange={(e) => upd("strategy", e.target.value)} />
            </div>
            <div>
              <label>Side</label>
              <select value={form.action} onChange={(e) => upd("action", e.target.value)} style={{ width: "100%" }}>
                {IB_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label>Quantity</label>
              <input type="number" step="any" style={{ width: "100%" }} value={form.quantity} onChange={(e) => upd("quantity", e.target.value)} />
            </div>
            <div>
              <label>Order type</label>
              <select value={form.orderType} onChange={(e) => upd("orderType", e.target.value)} style={{ width: "100%" }}>
                {IB_ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.orderType === "LMT" && (
              <div>
                <label>Limit price</label>
                <input type="number" step="any" style={{ width: "100%" }} value={form.limitPrice} onChange={(e) => upd("limitPrice", e.target.value)} />
              </div>
            )}
            <div>
              <label>Time in force</label>
              <select value={form.tif} onChange={(e) => upd("tif", e.target.value)} style={{ width: "100%" }}>
                {IB_TIME_IN_FORCE.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <button disabled={busy || (needsSymbol && command !== "CANCEL_ORDER" && !form.identifier.trim()) || (command === "CANCEL_ORDER" && !form.identifier.trim())}
                  onClick={submit} style={{ width: "100%" }}>
            {busy ? "Sending…" : baseLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
