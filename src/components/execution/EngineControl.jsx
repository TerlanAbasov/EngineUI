import { useState } from "react";
import { execApi } from "../../api/executionClient";

// RESTART_ENGINE / STOP_ENGINE / START_ENGINE ultimately run `sudo systemctl
// {restart,stop,start} engine` on the ExecutionEngine host (EngineService.java) — this
// is the ONE part of the command console that isn't a stub: stopping the engine here
// really does kill the live process, including any bracket/TP/SL order management it's
// running. That's why these three get a type-to-confirm gate instead of just
// window.confirm — a single misclick shouldn't be able to take down live trading.
const ACTIONS = [
  ["START_ENGINE", "Start engine", "start engine", false],
  ["RESTART_ENGINE", "Restart engine", "restart engine", true],
  ["STOP_ENGINE", "Stop engine", "stop engine", true],
];

export default function EngineControl({ onResult }) {
  const [confirmText, setConfirmText] = useState({});
  const [busy, setBusy] = useState(null);

  const run = async (command, label) => {
    setBusy(command);
    try {
      const message = await execApi.sendCommand({ command });
      onResult({ label, message });
    } catch (e) {
      onResult({ label, message: e.message, ok: false });
    } finally {
      setBusy(null);
      setConfirmText((c) => ({ ...c, [command]: "" }));
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Engine Control</h3>
      <div className="banner danger">
        Unlike the rest of this console, these three are <b>not</b> stubs — they run
        real <code>systemctl</code> commands on the ExecutionEngine host process itself.
        <b> Stop / Restart will interrupt live order management.</b>
      </div>

      <div className="danger-zone" style={{ display: "grid", gap: 14 }}>
        {ACTIONS.map(([cmd, label, phrase, guarded]) => {
          const typed = confirmText[cmd] || "";
          const ready = !guarded || typed.trim().toLowerCase() === phrase;
          return (
            <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 130, fontWeight: 600 }}>{label}</div>
              {guarded && (
                <input
                  placeholder={`type "${phrase}" to confirm`}
                  style={{ width: 220 }}
                  value={typed}
                  onChange={(e) => setConfirmText((c) => ({ ...c, [cmd]: e.target.value }))}
                />
              )}
              <button
                disabled={busy === cmd || !ready}
                onClick={() => run(cmd, label)}
                style={guarded ? { background: "var(--red)", color: "#fff" } : undefined}
              >
                {busy === cmd ? "Sending…" : label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
