# EngineUI — QuantPlat frontend

React 18 + Vite + Recharts UI for the QuantPlat quant trading & backtesting
platform. Talks to the Spring Boot backend (repo: **DecisionEngine**) over REST.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8080` (see `vite.config.js`), so start the
backend first. To point at a different backend, set `VITE_API_BASE`.

```bash
npm run build      # production bundle in dist/
```

## Tabs

- **Backtest** — run one strategy or all enabled strategies (leaderboard), pick a
  date range / capital / costs, view the per-strategy report (equity vs buy & hold,
  drawdown, KPIs, trades).
- **Strategies** — enable/disable each of the 31 strategies.
- **Universe** — manage the stock list (add/remove tickers, pull data).
- **Scanner** — current signals across enabled strategies.

## Docker

```bash
docker build -t engineui .
# serves the built SPA on :80 and proxies /api to the "backend" host (see nginx.conf)
```

For the full stack (Postgres + backend + frontend) use the `docker-compose.yml` in
the DecisionEngine repo.
