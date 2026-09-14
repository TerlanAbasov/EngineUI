import { useState } from "react";
import TradeConsole from "./TradeConsole";
import AccountConsole from "./AccountConsole";
import AlertSender from "./AlertSender";
import EngineControl from "./EngineControl";
import ActivityLog from "./ActivityLog";

const SECTIONS = [
  ["trade", "Trade Console"],
  ["account", "Account & Data"],
  ["alert", "Send Alert"],
  ["engine", "Engine Control"],
];

// ExecutionEngine (the live paper-trading order execution service) exposes exactly two
// HTTP endpoints today — POST /trades/command and POST /alerts/tv-hook — and neither
// returns structured data back. So this console is a *command console*, not a live
// dashboard: every action here fires a request and shows the engine's own status-string
// reply; it cannot show you positions, open orders, fills, or PnL, because there is no
// API to read them — those are only delivered to Telegram. See the banner below.
export default function ExecutionConsole() {
  const [section, setSection] = useState("trade");
  const [log, setLog] = useState([]);

  const pushLog = (entry) => setLog((l) => [{ id: Date.now() + Math.random(), time: new Date(), ...entry }, ...l].slice(0, 100));

  return (
    <div>
      <div className="panel banner">
        <b>Command console for ExecutionEngine</b> — paper account <code>DU8704817</code>.
        This talks to the live order-execution service; actions here can place, cancel,
        or close real (paper) IB orders. ExecutionEngine has no read API yet, so results
        for read-style commands (positions, PnL, open orders) are delivered to{" "}
        <b>Telegram</b>, not shown here — this console only shows whether the request was
        accepted.
      </div>

      <div className="subnav">
        {SECTIONS.map(([id, label]) => (
          <div key={id} className={`subtab ${section === id ? "active" : ""}`} onClick={() => setSection(id)}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 480px", minWidth: 320 }}>
          {section === "trade" && <TradeConsole onResult={pushLog} />}
          {section === "account" && <AccountConsole onResult={pushLog} />}
          {section === "alert" && <AlertSender onResult={pushLog} />}
          {section === "engine" && <EngineControl onResult={pushLog} />}
        </div>
        <div style={{ flex: "0 0 320px", minWidth: 280 }}>
          <ActivityLog entries={log} onClear={() => setLog([])} />
        </div>
      </div>
    </div>
  );
}
