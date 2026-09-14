# EngineUI — QuantPlat frontend

React 18 + Vite + Recharts UI for the QuantPlat quant trading & backtesting
platform. Talks to the Spring Boot backend (repo: **DecisionEngine**) over REST.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8082` (see `vite.config.js`), so start the
backend first. To point at a different backend, set `VITE_API_BASE`.

It also proxies `/exec-api` to `http://localhost:8081` — the **ExecutionEngine**
paper-trading order execution service (a separate repo/process) used by the
**Execution** tab. Set `VITE_EXEC_API_BASE` to point that at a different host.

```bash
npm run build      # production bundle in dist/
```

## Tabs

- **Backtest** — run one strategy, all enabled strategies (leaderboard), or a
  market-neutral **pairs** backtest; pick a date range / capital / costs; view the
  per-strategy report (equity vs buy & hold, drawdown, KPIs, trades). A **run
  history** list reloads any saved run (`GET /api/backtests`).
- **Strategies** — enable/disable each of the 100 strategies.
- **Universe** — manage the stock list (add merges server-side via
  `POST /api/universe`, remove replaces via `PUT`, plus data pull).
- **Scanner** — current signals across enabled strategies. Loads the last
  persisted signals (`GET /api/signals`) on open, and — when the backend has
  `quantplat.execution-engine.base-url` set — can forward a LONG/SHORT row to
  ExecutionEngine (`POST /api/execution/send`).
- **Execution** — a command console for ExecutionEngine itself (paper account
  `DU8704817`): manual trade commands (buy/sell/close-all/cancel), account &amp;
  PnL/positions requests, a raw TradingView-alert sender, and engine start/stop/
  restart. ExecutionEngine currently exposes only two endpoints — `POST
  /trades/command` and `POST /alerts/tv-hook` — neither returns structured data
  (results go to Telegram), so this tab is a command console, not a live dashboard;
  see `src/components/execution/`.

All timestamps from the backend are ISO-8601 instants (since the
bar-interval-timestamps migration) and are rendered as calendar dates, with the
clock shown only for intraday bars.

## Docker

```bash
docker build -t engineui .
# serves the built SPA on :80 and proxies /api to the "backend" host (see nginx.conf)
```

For the full stack (Postgres + backend + frontend) use the `docker-compose.yml` in
the DecisionEngine repo.
