// Client for ExecutionEngine (paper-trading order execution service, :8081 in dev,
// proxied at /exec-api — see vite.config.js / nginx.conf). Deliberately NOT modeled
// on api/client.js's req() helper: ExecutionEngine exposes exactly two endpoints today
// and neither returns structured JSON —
//   POST /alerts/tv-hook   -> 202/200, empty body, fire-and-forget (@Async on the backend)
//   POST /trades/command   -> 200, PLAIN TEXT status string (e.g. "📊 ... will be sent"),
//                              including for backend-caught errors ("❌ Error ...") — a
//                              200 does not mean the underlying action necessarily worked,
//                              it means the HTTP call reached the dispatcher.
// There is no read API — positions/orders/PnL/alerts are not retrievable over HTTP;
// results land in Telegram, not here. Every caller in this app must treat the resolved
// string as a status message, not as confirmation of a trading outcome.
const BASE = import.meta.env.VITE_EXEC_API_BASE || "";

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/exec-api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Could not reach ExecutionEngine (is it running on :8081?)");
  }

  const text = await res.text();
  if (!res.ok) {
    // Not the dispatcher's own caught-error string (that's a 200) — a real HTTP failure
    // (bad JSON shape, 404, 500 outside the dispatcher's try/catch, etc).
    throw new Error(text || `HTTP ${res.status}`);
  }
  return text;
}

export const execApi = {
  // tvAlert: { ticker, buy, sell, peerTicker, assetClass, strategy, routing, exchange,
  //            interval, time, timenow, volume, close, high, low, open, quote, base,
  //            plot0, plot1 } — all strings, mirrors TradingView's webhook payload shape.
  sendAlert: (tvAlert) => post("/alerts/tv-hook", tvAlert).then(() => "Alert accepted (queued for async processing)."),

  // commandDto: { command, identifier, strategy, action, quantity, orderType, limitPrice, tif }
  // `command` must be one of BotCommand's exact names (case-sensitive).
  sendCommand: (commandDto) => post("/trades/command", commandDto),
};

// Exact enum member names ExecutionEngine's DTOs deserialize with (Jackson matches Java
// enum constants case-sensitively) — extracted from the IB TWS API jar / the engine's own
// enums so the console's dropdowns can only submit values the backend actually accepts.
export const BOT_COMMANDS = [
  "POSITIONS", "SYNC_POSITIONS", "PNL", "CANCEL_PNL", "PNL_SINGLE",
  "BUY", "SELL", "CLOSE_ALL",
  "START_ACCOUNT_SUMMARY", "STOP_ACCOUNT_SUMMARY", "START_ACCOUNT_UPDATES", "STOP_ACCOUNT_UPDATES",
  "OPEN_ORDERS", "CANCEL_ORDER", "CANCEL_OPEN_ORDERS",
  "RESTART_ENGINE", "STOP_ENGINE", "START_ENGINE",
];

export const IB_ACTIONS = ["BUY", "SELL", "SSHORT"];

export const IB_TIME_IN_FORCE = ["DAY", "GTC", "OPG", "IOC", "GTD", "GTT", "AUC", "FOK", "GTX", "DTC", "Minutes"];

// Curated subset of com.ib.client.OrderType (40+ values exist; these are the ones
// relevant to a manual stock/crypto order here — StockTradeExecutor/CryptoTradeExecutor
// only ever build MKT/LMT/STP orders today).
export const IB_ORDER_TYPES = ["MKT", "LMT", "STP", "STP_LMT", "TRAIL", "MOC", "LOC"];
