import { useState } from "react";
import { execApi } from "../../api/executionClient";

// Simple no-argument commands, grouped for the grid below.
const GROUPS = [
  ["Positions", [
    ["POSITIONS", "Send positions", "Push current open positions to Telegram."],
    ["SYNC_POSITIONS", "Sync positions", "Re-sync the local position cache from IB."],
  ]],
  ["PnL", [
    ["PNL", "Start PnL stream", "Begin streaming account PnL to Telegram."],
    ["CANCEL_PNL", "Stop PnL stream", "Cancel the account PnL subscription."],
  ]],
  ["Orders", [
    ["OPEN_ORDERS", "Send open orders", "Push all open orders to Telegram."],
  ]],
  ["Account feed", [
    ["START_ACCOUNT_SUMMARY", "Start account summary", ""],
    ["STOP_ACCOUNT_SUMMARY", "Stop account summary", ""],
    ["START_ACCOUNT_UPDATES", "Start account updates", ""],
    ["STOP_ACCOUNT_UPDATES", "Stop account updates", ""],
  ]],
];

export default function AccountConsole({ onResult }) {
  const [busy, setBusy] = useState(null);
  const [reqId, setReqId] = useState("");
  const [pnlBusy, setPnlBusy] = useState(false);

  const run = async (command, label) => {
    setBusy(command);
    try {
      const message = await execApi.sendCommand({ command });
      onResult({ label, message });
    } catch (e) {
      onResult({ label, message: e.message, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const runPnlSingle = async () => {
    if (!reqId.trim()) return;
    setPnlBusy(true);
    try {
      const message = await execApi.sendCommand({ command: "PNL_SINGLE", identifier: reqId.trim() });
      onResult({ label: `PnL single #${reqId.trim()}`, message });
    } catch (e) {
      onResult({ label: `PnL single #${reqId.trim()}`, message: e.message, ok: false });
    } finally {
      setPnlBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Account &amp; Data</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        These trigger the same requests the Telegram bot's commands do — results are
        delivered to Telegram, this just confirms the request was accepted.
      </p>

      {GROUPS.map(([group, items]) => (
        <div key={group} style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 8px" }}>{group}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {items.map(([cmd, label, title]) => (
              <button key={cmd} className="secondary" title={title} disabled={busy === cmd}
                      onClick={() => run(cmd, label)}>
                {busy === cmd ? "Sending…" : label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <h4 style={{ margin: "0 0 8px" }}>PnL for one request ID</h4>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="request id" style={{ width: 140 }} value={reqId}
                 onChange={(e) => setReqId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runPnlSingle()} />
          <button className="secondary" disabled={pnlBusy || !reqId.trim()} onClick={runPnlSingle}>
            {pnlBusy ? "Sending…" : "Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
