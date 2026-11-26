/* Airdrop Radar — frontend.
 * Fetches data from our own proxy routes (/api/*). The CoinMarketCap API key
 * never reaches the browser; the server calls CMC and caches for 60s.
 */
'use strict';

const $ = (id) => document.getElementById(id);

function fmtUSD(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n).toFixed(2) + '%';
  const cls = n >= 0 ? 'pos' : 'neg';
  const sign = n >= 0 ? '▲ ' : '▼ ';
  return '<span class="' + cls + '">' + sign + v + '</span>';
}

function priceDecimals(price) {
  if (price >= 1000) return 2;
  if (price >= 1) return 2;
  if (price >= 0.01) return 4;
  return 6;
}

function coinCell(c) {
  return '<span class="coin-name">' + escapeHtml(c.name) + '</span>' +
    '<span class="coin-symbol">' + escapeHtml(c.symbol) + '</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function showError(msg) {
  const el = $('error-banner');
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = msg;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error((json && json.error) || ('HTTP ' + res.status));
  return json;
}

function applySource(source) {
  const badge = $('source-badge');
  const banner = $('demo-banner');
  if (source === 'live') {
    badge.textContent = '● LIVE DATA';
    badge.className = 'badge live';
    banner.hidden = true;
  } else {
    badge.textContent = 'DEMO DATA';
    badge.className = 'badge demo';
    banner.hidden = false;
  }
}

function renderMarket(envelope) {
  const d = envelope.data && envelope.data.data;
  if (!d || !d.quote || !d.quote.USD) return;
  const usd = d.quote.USD;
  $('stat-market-cap').textContent = fmtCompact(usd.total_market_cap);
  $('stat-volume').textContent = fmtCompact(usd.total_volume_24h);
  $('stat-btc-dom').textContent =
    d.btc_dominance !== undefined ? Number(d.btc_dominance).toFixed(1) + '%' : '—';
  $('stat-active').textContent =
    d.active_cryptocurrencies !== undefined
      ? Number(d.active_cryptocurrencies).toLocaleString('en-US')
      : '—';
}

function renderTrending(envelope) {
  const coins = (envelope.data && envelope.data.data) || [];
  const rows = coins.slice(0, 10).map((c, i) => {
    const q = c.quote.USD;
    return '<tr><td>' + (i + 1) + '</td><td>' + coinCell(c) + '</td>' +
      '<td class="num">' + fmtUSD(q.price, priceDecimals(q.price)) + '</td>' +
      '<td class="num">' + fmtPct(q.percent_change_24h) + '</td>' +
      '<td class="num">' + fmtCompact(q.market_cap) + '</td></tr>';
  });
  $('trending-body').innerHTML = rows.join('') || '<tr><td colspan="5">No data.</td></tr>';
}

function renderGainersLosers(listings) {
  const coins = ((listings.data && listings.data.data) || []).slice().sort((a, b) =>
    (b.quote.USD.percent_change_24h || 0) - (a.quote.USD.percent_change_24h || 0));
  const row = (c) => {
    const q = c.quote.USD;
    return '<tr><td>' + coinCell(c) + '</td>' +
      '<td class="num">' + fmtUSD(q.price, priceDecimals(q.price)) + '</td>' +
      '<td class="num">' + fmtPct(q.percent_change_24h) + '</td></tr>';
  };
  $('gainers-body').innerHTML =
    coins.slice(0, 5).map(row).join('') || '<tr><td colspan="3">No data.</td></tr>';
  $('losers-body').innerHTML =
    coins.slice(-5).reverse().map(row).join('') || '<tr><td colspan="3">No data.</td></tr>';
}

function renderNewListings(listings) {
  const coins = ((listings.data && listings.data.data) || []).slice().sort((a, b) =>
    new Date(b.date_added) - new Date(a.date_added));
  const rows = coins.slice(0, 8).map((c) => {
    const q = c.quote.USD;
    const date = new Date(c.date_added).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    return '<tr><td>' + coinCell(c) + '</td>' +
      '<td class="num">' + fmtUSD(q.price, priceDecimals(q.price)) + '</td>' +
      '<td class="num">' + fmtPct(q.percent_change_24h) + '</td>' +
      '<td class="num">' + date + '</td></tr>';
  });
  $('new-body').innerHTML = rows.join('') || '<tr><td colspan="4">No data.</td></tr>';
}

let lastSource = 'demo';

async function refreshAll() {
  try {
    const [market, listings, trending] = await Promise.all([
      fetchJson('/api/market'),
      fetchJson('/api/listings'),
      fetchJson('/api/trending'),
    ]);
    lastSource = market.source || 'demo';
    applySource(lastSource);
    renderMarket(market);
    renderTrending(trending);
    renderGainersLosers(listings);
    renderNewListings(listings);
    $('last-updated').textContent = new Date().toLocaleTimeString('en-GB');
    showError('');
  } catch (e) {
    showError('Could not load market data: ' + e.message);
  }
}

async function searchCoin(query) {
  const box = $('search-result');
  box.innerHTML = '<p class="muted">Searching…</p>';
  try {
    const env = await fetchJson('/api/quotes?symbol=' + encodeURIComponent(query));
    const data = (env.data && env.data.data) || {};
    const keys = Object.keys(data);
    if (keys.length === 0) {
      box.innerHTML = '<p class="muted">No coin found for "' + escapeHtml(query) + '". Try a symbol like BTC or SOL.</p>';
      return;
    }
    const c = data[keys[0]];
    const q = c.quote.USD;
    box.innerHTML =
      '<div class="coin-card"><h3>' + escapeHtml(c.name) + ' <span class="coin-symbol">' +
      escapeHtml(c.symbol) + ' · Rank #' + c.cmc_rank + '</span></h3>' +
      '<div class="rows">' +
      '<span>Price: <b>' + fmtUSD(q.price, priceDecimals(q.price)) + '</b></span>' +
      '<span>Market cap: <b>' + fmtCompact(q.market_cap) + '</b></span>' +
      '<span>24h volume: <b>' + fmtCompact(q.volume_24h) + '</b></span>' +
      '<span>24h change: ' + fmtPct(q.percent_change_24h) + '</span>' +
      '<span>7d change: ' + fmtPct(q.percent_change_7d) + '</span>' +
      '<span>1h change: ' + fmtPct(q.percent_change_1h) + '</span>' +
      '</div></div>';
  } catch (e) {
    box.innerHTML = '<p class="muted">Search failed: ' + escapeHtml(e.message) + '</p>';
  }
}

$('refresh-btn').addEventListener('click', refreshAll);
$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (q) searchCoin(q);
});

refreshAll();
setInterval(refreshAll, 60000);
