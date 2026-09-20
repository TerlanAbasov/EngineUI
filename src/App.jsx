import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useBacktestJob } from "./context/BacktestJobContext";
import StrategyTable from "./components/StrategyTable";
import UniverseEditor from "./components/UniverseEditor";
import BacktestPanel from "./components/BacktestPanel";
import Scanner from "./components/Scanner";
import ChartView from "./components/ChartView";
import ExecutionConsole from "./components/execution/ExecutionConsole";
import PaperTrading from "./components/PaperTrading";

const ICON_PROPS = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

// Brand mark: a ring (the "engine") enclosing an ascending bar series (the "quant").
// Kept as one glyph, distinct from the nav icons, so it reads as a logo rather than
// another tab icon.
const LOGO = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="7.4" stroke="currentColor" strokeWidth="1.8" />
    <rect x="8.4" y="12.4" width="1.8" height="3.2" rx="0.9" fill="currentColor" />
    <rect x="11.1" y="9.6" width="1.8" height="6" rx="0.9" fill="currentColor" />
    <rect x="13.8" y="7.4" width="1.8" height="8.2" rx="0.9" fill="currentColor" />
  </svg>
);

const ICONS = {
  backtest: (
    <svg {...ICON_PROPS}><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="7" width="3.6" height="13" rx="1" /><rect x="16.4" y="3" width="3.6" height="17" rx="1" /></svg>
  ),
  chart: (
    <svg {...ICON_PROPS}><path d="M3 16.5l5-5.2 4 3.6L20.5 6" /><circle cx="20.5" cy="6" r="1.3" fill="currentColor" stroke="none" /></svg>
  ),
  strategies: (
    <svg {...ICON_PROPS}><path d="M12 3.2l8.5 4.6-8.5 4.6-8.5-4.6L12 3.2z" /><path d="M3.5 12.6l8.5 4.6 8.5-4.6" /><path d="M3.5 17l8.5 4.6L20.5 17" /></svg>
  ),
  universe: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.8 2.4 4.3 5.3 4.3 8.5s-1.5 6.1-4.3 8.5c-2.8-2.4-4.3-5.3-4.3-8.5S9.2 5.9 12 3.5z" /></svg>
  ),
  scanner: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" /></svg>
  ),
  execution: (
    <svg {...ICON_PROPS}><path d="M12.6 3L5.3 13.6h5.4L11 21l7.7-10.6h-5.4l-.7-7.4z" /></svg>
  ),
  paper: (
    <svg {...ICON_PROPS}><path d="M4 5h11l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5z" /><path d="M15 5v5h5" /><path d="M8 14h8M8 17h5" /></svg>
  ),
};

// [id, label, group] — group renders as a small heading above the first tab in it.
const TABS = [
  ["backtest", "Backtest", "Research"],
  ["chart", "Chart", "Research"],
  ["strategies", "Strategies", "Research"],
  ["universe", "Universe", "Research"],
  ["scanner", "Scanner", "Research"],
  ["paper", "Paper Trading", "Live trading"],
  ["execution", "Execution", "Live trading"],
];

export default function App() {
  const [tab, setTab] = useState("backtest");
  const [source, setSource] = useState(null);
  const { job, running, pendingOutcome } = useBacktestJob();

  useEffect(() => { api.source().then((s) => setSource(s.source)).catch(() => {}); }, []);

  let lastGroup = null;

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="brand-mark">{LOGO}</div>
          <div className="brand-text">
            <h1>QuantEngine</h1>
            <div className="tagline">Research &amp; execution platform</div>
          </div>
        </div>
        <div className="status-pill" title="Active market data source">
          <span className={`status-dot ${source ? "on" : ""}`} />
          {source || "connecting…"}
        </div>
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
                  <div className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)} tabIndex={0}
                       onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTab(id)}>
                    <span className="tab-icon">{ICONS[id]}</span>
                    <span>{label}</span>
                    {id === "backtest" && running && (
                      <span className="tab-badge" title={`Backtest running · ${job.percent}%`}>{job.percent}%</span>
                    )}
                    {id === "backtest" && !running && pendingOutcome && tab !== "backtest" && (
                      <span className="tab-badge done" title="A backtest finished — open the tab to see it">
                        {pendingOutcome.status === "COMPLETED" ? "✓" : "!"}
                      </span>
                    )}
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
          {tab === "paper" && <PaperTrading />}
          {tab === "execution" && <ExecutionConsole />}
        </div>
      </div>
    </div>
  );
}
