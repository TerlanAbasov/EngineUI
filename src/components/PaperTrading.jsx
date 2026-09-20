import { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import StatusPanel from "./paper/StatusPanel";
import SettingsPanel from "./paper/SettingsPanel";
import StrategiesPanel from "./paper/StrategiesPanel";
import PositionsPanel from "./paper/PositionsPanel";
import OrdersPanel from "./paper/OrdersPanel";
import CyclesPanel from "./paper/CyclesPanel";
import EquityPanel from "./paper/EquityPanel";

const SECTIONS = [
  ["strategies", "Strategies"],
  ["positions", "Positions"],
  ["orders", "Orders"],
  ["cycles", "Cycles"],
  ["equity", "Equity"],
];

/**
 * Paper trading: a job that checks every strategy on every symbol on a schedule and trades the net position in the
 * Alpaca demo account, so each strategy's result in real time can be measured. Configure it, run it, monitor it.
 */
export default function PaperTrading() {
  const status = usePolling(() => api.liveStatus(), 5000, []);
  const [section, setSection] = useState("strategies");
  return (
    <div>
      <StatusPanel status={status.data} error={status.error} onChanged={status.reload} />
      <SettingsPanel settings={status.data?.settings} onSaved={status.reload} />
      <div className="subnav">
        {SECTIONS.map(([id, label]) => (
          <div key={id} className={`subtab ${section === id ? "active" : ""}`} onClick={() => setSection(id)}>{label}</div>
        ))}
      </div>
      {section === "strategies" && <StrategiesPanel />}
      {section === "positions" && <PositionsPanel />}
      {section === "orders" && <OrdersPanel />}
      {section === "cycles" && <CyclesPanel />}
      {section === "equity" && <EquityPanel />}
    </div>
  );
}
