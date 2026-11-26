# API Notes — Airdrop Radar (Build with CMC, Round 2)

## What the API made possible

- **One API, whole dashboard.** Four endpoints cover everything the app needs:
  market overview (`global-metrics/quotes/latest`), the top 100 market
  (`listings/latest`), trending (`trending/latest`) and per-coin quotes
  (`quotes/latest`). No scraping, no second data source.
- **Derived features for free.** Gainers/losers and "new listings" need no
  extra endpoints — they are computed client-side from `listings/latest`
  (sort by `percent_change_24h`, sort by `date_added`). That keeps the app
  inside the free-tier call budget.
- **Consistent response shape.** Every endpoint returns the same
  `{status, data}` envelope, so one rendering path handles all of them.

## Where the API got in the way

- **Trending is plan-gated (unverified live, handled defensively).**
  `/v1/cryptocurrency/trending/latest` is not guaranteed on every plan. The
  server tries it first and, on any non-200 response, falls back to ranking
  the top 100 listings by 24h change. Live verification of which plans
  include it is still pending a real API key.
- **`/v1/cryptocurrency/listings/new` not used.** A dedicated "new listings"
  endpoint exists, but to stay inside the free tier the app sorts
  `listings/latest` by `date_added` instead. The trade-off: coins ranked
  below the top 100 never appear as "new" here.
- **No fuzzy name search.** `quotes/latest` needs an exact symbol (or id /
  slug). The search box therefore matches symbol, name or slug exactly; a
  typo returns "not found" instead of suggestions.
- **Rate limits shape the design.** The free Basic plan is 10,000 credits /
  month and 30 calls / minute (per CMC pricing). The server caches every
  upstream response in memory for 60 seconds and the frontend refreshes at
  most once a minute, so normal use costs ~4 calls per minute.
- **Key handling.** The key must never be committed or shipped to the
  browser, so all CMC calls go through a server-side proxy. A purely static
  deployment (e.g. GitHub Pages) cannot run this app live — it needs the
  Node server (or any tiny backend) in front of the key.

## Live verification status

At build time no API key was available yet (the CoinMarketCap account is
still being created), so the live code paths could not be exercised against
`api.coinmarketcap.com`. The server was verified end-to-end in demo mode
(sample data) and the proxy code logs every upstream request with a
timestamp, so the first live run is easy to confirm: start with
`CMC_API_KEY` set and check for `[live] GET https://api.coinmarketcap.com/...`
lines plus the `● LIVE DATA` badge in the UI.
