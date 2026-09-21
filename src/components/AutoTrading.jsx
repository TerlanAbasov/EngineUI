import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import AutoTradeStatus from "./autotrade/AutoTradeStatus";
import AutoTradeSettings from "./autotrade/AutoTradeSettings";
import AutoTradeCommands from "./autotrade/AutoTradeCommands";

/**
 * Auto trading: a job that watches every strategy on every Universe symbol in the strategy's own timeframe and sends ExecutionEngine a BUY or SELL
 * when one turns LONG or SHORT on a bar that just completed. Switch it on or off here, set what it may send, and see what it did.
 */
export default function AutoTrading() {
  const status = usePolling(() => api.autoTradeStatus(), 5000, []);
  return (
    <div>
      <AutoTradeStatus status={status.data} error={status.error} onChanged={status.reload} />
      <AutoTradeSettings settings={status.data?.settings} onSaved={status.reload} />
      <AutoTradeCommands />
    </div>
  );
}
