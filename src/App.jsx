import { useEffect, useState } from "react";
import { api } from "./api/client";
import StrategyTable from "./components/StrategyTable";
import UniverseEditor from "./components/UniverseEditor";
import BacktestPanel from "./components/BacktestPanel";
import Scanner from "./components/Scanner";

const TABS = [
  ["backtest", "Backtest"],
  ["strategies", "Strategies"],
  ["universe", "Universe"],
  ["scanner", "Scanner"],
];

export default function App() {
  const [tab, setTab] = useState("backtest");
  const [source, setSource] = useState(null);

  useEffect(() => { api.source().then((s) => setSource(s.source)).catch(() => {}); }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>QuantPlat</h1>
        <span className="src">
          research &amp; backtesting · data source: <b>{source || "…"}</b>
        </span>
      </div>

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <div key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </div>
        ))}
      </div>

      {tab === "backtest" && <BacktestPanel />}
      {tab === "strategies" && <StrategyTable />}
      {tab === "universe" && <UniverseEditor />}
      {tab === "scanner" && <Scanner />}
    </div>
  );
}
