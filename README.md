# 📡 Airdrop Radar

A live crypto dashboard for airdrop hunters, built for the **Build with CMC: API Hackathon Round 2** (Track: **Data & Visualisation**).

Airdrop Radar turns CoinMarketCap market data into one glanceable page: market overview, trending coins, top gainers & losers, the newest listings, and a coin search — so hunters can spot what is moving before everyone else does.

## Features

- **Market overview** — total market cap, 24h volume, BTC dominance, active cryptocurrencies.
- **Trending coins** — what the market is watching right now.
- **Top gainers & losers (24h)** — computed from the top 100 listings.
- **New listings** — coins sorted by listing date, so new airdrop-era tokens show up first.
- **Coin search** — type a symbol or name (e.g. `BTC`, `SOL`, `Ethereum`) for price, market cap, volume and 24h/7d change.
- **Auto-refresh** every 60 seconds, with a manual refresh button and a last-updated label.
- **Demo mode** — without an API key the app runs on bundled sample data and shows a clear `DEMO DATA` badge, so the dashboard is always demonstrable.

## How to run

```bash
# 1. Install (no dependencies — Node.js 18+ only)
npm start

# 2. For live data, set your CoinMarketCap API key first:
CMC_API_KEY=your_key_here npm start
# or: export CMC_API_KEY=your_key_here && npm start
```

Then open http://localhost:8000 (or `$PORT` if set).

> ⚠️ Never commit a real API key. `.env.example` shows the variable names only. The key is read from the `CMC_API_KEY` environment variable and is never written to any file or sent to the browser — the server proxies all CMC calls.

## CoinMarketCap API endpoints used

| Feature | Endpoint |
|---|---|
| Market overview | `GET /v1/global-metrics/quotes/latest` |
| Top 100 listings (gainers, losers, new listings) | `GET /v1/cryptocurrency/listings/latest?limit=100&convert=USD` |
| Trending coins | `GET /v1/cryptocurrency/trending/latest?limit=10` — if this endpoint is rejected by the current plan, the server falls back to ranking the top 100 listings by 24h percent change |
| Coin search | `GET /v1/cryptocurrency/quotes/latest?symbol={SYMBOL}` |

All calls go through the server-side proxy routes `/api/market`, `/api/listings`, `/api/trending`, `/api/quotes`. Upstream responses are cached in memory for 60 seconds to save API quota.

## Proof of a real API call

1. Start the server with a valid key: `CMC_API_KEY=your_key_here npm start`.
2. Open http://localhost:8000 and watch the badge switch to `● LIVE DATA`.
3. The server logs every upstream call with a timestamp, e.g. `[live] GET https://api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=100&convert=USD`.
4. `curl http://localhost:8000/api/market` returns the live response envelope (`{"source":"live","updated_at":"...","data":{...}}`).
5. `sample-response.json` shows the exact structure of a `listings/latest` response.

## Project structure

```
.
├── server.js            # zero-dependency Node server + CMC proxy (60s cache)
├── sample-data.json     # bundled demo data (clearly labelled, not live)
├── sample-response.json # example listings/latest response structure
├── API_NOTES.md         # what the API made possible / where it got in the way
├── package.json         # "start": "node server.js"
├── .env.example         # variable names only — no real key
└── public/
    ├── index.html       # dashboard page
    ├── app.js           # fetches /api/*, renders tables, auto-refresh
    └── style.css        # responsive styling
```

## What the API made possible / where it got in the way

See `API_NOTES.md`.

## License

MIT
