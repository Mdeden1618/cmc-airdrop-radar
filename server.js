/**
 * Airdrop Radar — server
 *
 * Zero-dependency Node.js server (built-in http/https only).
 *
 * - Serves the static dashboard from public/
 * - Proxies CoinMarketCap API calls so the API key never leaves the server:
 *     GET /api/market   -> /v1/global-metrics/quotes/latest
 *     GET /api/listings -> /v1/cryptocurrency/listings/latest?limit=100
 *     GET /api/trending -> /v1/cryptocurrency/trending/latest (falls back to
 *                          a listings-derived ranking when the plan rejects it)
 *     GET /api/quotes?symbol=BTC -> /v1/cryptocurrency/quotes/latest
 * - Upstream responses are cached in memory for 60 seconds to save API quota.
 * - Without CMC_API_KEY the server still runs on bundled sample data and
 *   clearly marks every response with source:"demo".
 *
 * Run:  CMC_API_KEY=your_key node server.js   (PORT env, default 8000)
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const API_KEY = (process.env.CMC_API_KEY || '').trim();
const LIVE = API_KEY.length > 0;
const CACHE_TTL_MS = 60 * 1000;
const CMC_HOST = 'pro-api.coinmarketcap.com';

const sampleData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
);

const cache = new Map(); // key -> { at: number, body: string }

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.body;
}

function cacheSet(key, body) {
  cache.set(key, { at: Date.now(), body });
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** One authenticated GET to the CoinMarketCap API. Rejects on non-200. */
function cmcGet(cmcPath) {
  return new Promise((resolve, reject) => {
    log('[live] GET https://' + CMC_HOST + cmcPath);
    const req = https.request(
      {
        hostname: CMC_HOST,
        path: cmcPath,
        method: 'GET',
        headers: {
          'X-CMC_PRO_API_KEY': API_KEY,
          Accept: 'application/json',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            return reject(new Error('Invalid JSON from CoinMarketCap'));
          }
          if (res.statusCode !== 200) {
            const msg =
              (json && json.status && json.status.error_message) ||
              'HTTP ' + res.statusCode;
            const err = new Error(msg);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fallback for /v1/cryptocurrency/trending/latest when the current plan
 * rejects it: rank the top 100 listings by 24h percent change.
 */
function trendingFromListings(listingsJson) {
  const coins = ((listingsJson && listingsJson.data) || [])
    .slice()
    .sort(
      (a, b) =>
        (b.quote.USD.percent_change_24h || 0) -
        (a.quote.USD.percent_change_24h || 0)
    );
  return {
    status: {
      note: 'Computed from listings/latest — trending endpoint unavailable on this plan.',
    },
    data: coins.slice(0, 10),
  };
}

/** Demo-mode quote lookup: match by symbol, name or slug (case-insensitive). */
function quotesFromSample(input) {
  const needle = (input || '').trim().toLowerCase();
  const found = (sampleData.listings.data || []).find(
    (c) =>
      c.symbol.toLowerCase() === needle ||
      c.name.toLowerCase() === needle ||
      c.slug.toLowerCase() === needle
  );
  if (!found) {
    return {
      status: { error_message: 'Coin not found in sample data: ' + input },
      data: {},
    };
  }
  const out = {};
  out[found.symbol] = found;
  return { status: {}, data: out };
}

function envelope(source, data) {
  return JSON.stringify({
    source,
    updated_at: new Date().toISOString(),
    data,
  });
}

async function handleApi(req, res, route, query) {
  const cacheKey = route + JSON.stringify(query);
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(cached);
  }

  let body;
  if (!LIVE) {
    let data;
    if (route === '/api/market') data = sampleData.globalMetrics;
    else if (route === '/api/listings') data = sampleData.listings;
    else if (route === '/api/trending') data = sampleData.trending;
    else if (route === '/api/quotes') data = quotesFromSample(query.symbol || '');
    body = envelope('demo', data);
  } else {
    try {
      let data;
      if (route === '/api/market') {
        data = await cmcGet('/v1/global-metrics/quotes/latest');
      } else if (route === '/api/listings') {
        data = await cmcGet(
          '/v1/cryptocurrency/listings/latest?limit=100&convert=USD'
        );
      } else if (route === '/api/trending') {
        try {
          data = await cmcGet('/v1/cryptocurrency/trending/latest?limit=10');
        } catch (e) {
          log('[live] trending endpoint failed (' + e.message + ') — falling back to listings-derived ranking');
          const listings = await cmcGet(
            '/v1/cryptocurrency/listings/latest?limit=100&convert=USD'
          );
          data = trendingFromListings(listings);
        }
      } else if (route === '/api/quotes') {
        const symbol = (query.symbol || '').toUpperCase().trim();
        if (!symbol) throw new Error('Missing ?symbol= parameter');
        data = await cmcGet(
          '/v1/cryptocurrency/quotes/latest?symbol=' + encodeURIComponent(symbol)
        );
      }
      body = envelope('live', data);
    } catch (e) {
      log('[error]', route, e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({ source: 'error', error: e.message })
      );
    }
  }

  cacheSet(cacheKey, body);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safe);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ ok: true, mode: LIVE ? 'live' : 'demo' })
    );
  }
  if (pathname === '/api/market' || pathname === '/api/listings' || pathname === '/api/trending') {
    return handleApi(req, res, pathname, {});
  }
  if (pathname === '/api/quotes') {
    return handleApi(req, res, pathname, {
      symbol: url.searchParams.get('symbol') || '',
    });
  }
  if (req.method === 'GET') return serveStatic(req, res, pathname);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  log('Airdrop Radar running on http://localhost:' + PORT);
  log(
    LIVE
      ? 'Mode: LIVE — CoinMarketCap API (key set via CMC_API_KEY)'
      : 'Mode: DEMO DATA — set CMC_API_KEY for live data'
  );
});
