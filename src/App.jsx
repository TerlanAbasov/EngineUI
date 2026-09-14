import { useEffect, useState } from "react";
import { api } from "./api/client";
import StrategyTable from "./components/StrategyTable";
import UniverseEditor from "./components/UniverseEditor";
import BacktestPanel from "./components/BacktestPanel";
import Scanner from "./components/Scanner";
import ChartView from "./components/ChartView";
import ExecutionConsole from "./components/execution/ExecutionConsole";

// [id, label, group] — group renders as a small heading above the first tab in it.
const TABS = [
  ["backtest", "Backtest", "Research"],
  ["chart", "Chart", "Research"],
  ["strategies", "Strategies", "Research"],
  ["universe", "Universe", "Research"],
  ["scanner", "Scanner", "Research"],
  ["execution", "Execution", "Live trading"],
];

export default function App() {
  const [tab, setTab] = useState("backtest");
  const [source, setSource] = useState(null);

  useEffect(() => { api.source().then((s) => setSource(s.source)).catch(() => {}); }, []);

  let lastGroup = null;

  return (
    <div className="app">
      <div className="header">
        <h1>QuantPlat</h1>
        <span className="src">
          research &amp; backtesting · data source: <b>{source || "…"}</b>
        </span>
      </div>

      <div className="layout">
        <nav className="sidebar">
          <div className="tabs">
            {TABS.map(([id, label, group]) => {
              const showLabel = group !== lastGroup;
              lastGroup = group;
              return (
                <div key={id}>
                  {showLabel && <div className="tab-group-label">{group}</div>}
                  <div className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="content">
          {tab === "backtest" && <BacktestPanel />}
          {tab === "chart" && <ChartView />}
          {tab === "strategies" && <StrategyTable />}
          {tab === "universe" && <UniverseEditor />}
          {tab === "scanner" && <Scanner />}
          {tab === "execution" && <ExecutionConsole />}
        </div>
      </div>
    </div>
  );
}
