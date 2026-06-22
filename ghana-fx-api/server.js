/**
 * Ghana FX Tracker API
 * =====================
 * Serves bank exchange rate data for the Labari FX Tracker.
 *
 * Endpoints:
 *   GET /api/rates?currency=USD          — all banks + BoG for a given currency
 *   GET /api/rates/bog                   — BoG interbank rates only (all currencies)
 *   GET /api/rates/banks?currency=USD    — commercial banks only
 *   GET /api/rates/convert               — currency conversion
 *     ?amount=100&from=USD&to=GHS&bank=gcb
 *   GET /api/status                      — API health + cache status
 *   POST /api/rates/refresh              — force cache bust + re-fetch
 *
 * Caching:
 *   BoG rates:   30 min TTL (BoG updates once daily ~3:30pm Accra time)
 *   Bank rates:  15 min TTL (commercial banks update at market open)
 *   Auto-refresh via cron at 09:15 and 15:45 Accra time (GMT+0 = same as UTC)
 */

const express    = require('express');
const cors       = require('cors');
const cron       = require('node-cron');
const cache      = require('./cache');
const { fetchBoGRates }    = require('./scrapers/bog');
const { scrapeAllBanks }   = require('./scrapers/banks');
const { buildBankRates }   = require('./rateBlender');

const app  = express();
const PORT = process.env.PORT || 3001;

const BOG_TTL   = 30 * 60 * 1000;  // 30 min
const BANKS_TTL = 15 * 60 * 1000;  // 15 min

app.use(cors());
app.use(express.json());

// ─── Logging middleware ───────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ─── Core fetch functions (with caching) ─────────────────────────

async function getBoGRates(forceRefresh = false) {
  if (!forceRefresh && cache.has('bog')) {
    return cache.get('bog').value;
  }
  console.log('[BoG] Fetching fresh rates from bog.gov.gh…');
  try {
    const data = await fetchBoGRates();
    cache.set('bog', data, BOG_TTL);
    console.log(`[BoG] Fetched ${Object.keys(data.rates).length} currencies. Date: ${data.date}`);
    return data;
  } catch (err) {
    console.error('[BoG] Fetch failed:', err.message);
    // Return stale cache if available
    const stale = cache.store?.get('bog');
    if (stale) {
      console.warn('[BoG] Using stale cache');
      return { ...stale.value, stale: true };
    }
    throw err;
  }
}

async function getBankRates(currency = 'USD', forceRefresh = false) {
  const cacheKey = `banks_${currency}`;

  if (!forceRefresh && cache.has(cacheKey)) {
    return cache.get(cacheKey).value;
  }

  console.log(`[Banks] Scraping all banks for ${currency}…`);
  const bogData  = await getBoGRates();
  const scraped  = await scrapeAllBanks();

  const successCount = scraped.filter(r => r.scraped).length;
  console.log(`[Banks] Live scrapes: ${successCount}/${scraped.length}`);

  const banks = buildBankRates(scraped, bogData.rates, currency);
  const result = {
    currency,
    banks,
    liveCount:      successCount,
    estimatedCount: banks.length - successCount,
    fetchedAt:      new Date().toISOString(),
  };

  cache.set(cacheKey, result, BANKS_TTL);
  return result;
}

// ─── Routes ──────────────────────────────────────────────────────

/**
 * GET /api/rates
 * Returns BoG + all commercial bank rates for a currency.
 * ?currency=USD|GBP|EUR (default USD)
 */
app.get('/api/rates', async (req, res) => {
  const currency = (req.query.currency || 'USD').toUpperCase();
  const supported = ['USD', 'GBP', 'EUR', 'CHF', 'CAD', 'AUD', 'JPY'];

  if (!supported.includes(currency)) {
    return res.status(400).json({ error: `Unsupported currency. Use one of: ${supported.join(', ')}` });
  }

  try {
    const [bogData, bankData] = await Promise.all([
      getBoGRates(),
      getBankRates(currency),
    ]);

    const bogRate = bogData.rates[currency];
    if (!bogRate) {
      return res.status(404).json({ error: `No BoG rate available for ${currency}` });
    }

    // Summary stats
    const liveRates   = bankData.banks.filter(b => b.dataType === 'live');
    const allBuying   = bankData.banks.map(b => b.buying).sort((a, b) => a - b);
    const allSpreads  = bankData.banks.map(b => b.spread);
    const avgSpread   = +(allSpreads.reduce((a, b) => a + b, 0) / allSpreads.length).toFixed(4);

    return res.json({
      currency,
      asOf: bogData.date,
      bog: {
        buying:         bogRate.buying,
        selling:        bogRate.selling,
        mid:            bogRate.mid,
        weightedMedian: bogData.weightedMedian,
        source:         bogData.url,
        fetchedAt:      bogData.fetchedAt,
      },
      summary: {
        bestBuyRate:    allBuying[0],
        worstBuyRate:   allBuying[allBuying.length - 1],
        averageSpread:  avgSpread,
        bankCount:      bankData.banks.length,
        liveDataCount:  bankData.liveCount,
        estimatedCount: bankData.estimatedCount,
      },
      banks: bankData.banks,
      cache: {
        bogCachedAt:   cache.meta('bog')?.cachedAt,
        banksCachedAt: cache.meta(`banks_${currency}`)?.cachedAt,
      },
    });
  } catch (err) {
    console.error('/api/rates error:', err.message);
    return res.status(503).json({
      error: 'Failed to fetch rates. Please try again shortly.',
      detail: err.message,
    });
  }
});

/**
 * GET /api/rates/bog
 * BoG interbank rates for all available currencies.
 */
app.get('/api/rates/bog', async (req, res) => {
  try {
    const data = await getBoGRates();
    return res.json(data);
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
});

/**
 * GET /api/rates/banks
 * Commercial bank rates only, for a given currency.
 */
app.get('/api/rates/banks', async (req, res) => {
  const currency = (req.query.currency || 'USD').toUpperCase();
  try {
    const data = await getBankRates(currency);
    return res.json(data);
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
});

/**
 * GET /api/rates/convert
 * Simple currency conversion.
 * ?amount=500&direction=buy&bank=gcb&currency=USD
 * direction: "buy" = GHS→USD (bank buys USD from you)
 *            "sell" = USD→GHS (bank sells USD to you)
 */
app.get('/api/rates/convert', async (req, res) => {
  const { amount, direction = 'buy', bank: bankId, currency = 'USD' } = req.query;

  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'Provide a valid numeric amount' });
  }

  try {
    const bankData = await getBankRates(currency.toUpperCase());
    const bank     = bankId ? bankData.banks.find(b => b.id === bankId) : null;

    // Default to best-rate bank if none specified
    const useBank  = bank || [...bankData.banks].sort((a, b) => a.buying - b.buying)[0];
    const rate     = direction === 'sell' ? useBank.selling : useBank.buying;
    const amt      = parseFloat(amount);

    let result, fromCurrency, toCurrency;
    if (direction === 'buy') {
      // Customer gives GHS, gets foreign currency
      result       = +(amt / rate).toFixed(6);
      fromCurrency = 'GHS';
      toCurrency   = currency.toUpperCase();
    } else {
      // Customer gives foreign currency, gets GHS
      result       = +(amt * rate).toFixed(2);
      fromCurrency = currency.toUpperCase();
      toCurrency   = 'GHS';
    }

    return res.json({
      input:        amt,
      fromCurrency,
      toCurrency,
      result,
      rate,
      direction,
      bank: {
        id:       useBank.id,
        name:     useBank.name,
        dataType: useBank.dataType,
      },
      note: 'Indicative rate only. Confirm with your bank before transacting.',
    });
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
});

/**
 * POST /api/rates/refresh
 * Force a cache refresh (useful for manual triggers or webhooks).
 */
app.post('/api/rates/refresh', async (req, res) => {
  try {
    cache.clear('bog');
    ['USD', 'GBP', 'EUR', 'CHF', 'CAD'].forEach(c => cache.clear(`banks_${c}`));

    const bogData = await getBoGRates(true);
    return res.json({
      success: true,
      message: 'Cache cleared and BoG rates refreshed',
      bogDate: bogData.date,
      currencies: Object.keys(bogData.rates),
    });
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
});

/**
 * GET /api/status
 * Health check + cache info.
 */
app.get('/api/status', (req, res) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: {
      bog:      cache.meta('bog'),
      banksUSD: cache.meta('banks_USD'),
      banksGBP: cache.meta('banks_GBP'),
      banksEUR: cache.meta('banks_EUR'),
    },
  });
});

// ─── Scheduled refresh ───────────────────────────────────────────
// Run at 09:15 and 15:45 Accra time (UTC+0, so same as UTC)
// BoG publishes closing rate by 16:00; we refresh after 15:45 to catch it.
cron.schedule('15 9 * * 1-5', async () => {
  console.log('[Cron] Morning rate refresh…');
  try {
    await getBoGRates(true);
    await getBankRates('USD', true);
  } catch (e) { console.error('[Cron] Morning refresh failed:', e.message); }
});

cron.schedule('45 15 * * 1-5', async () => {
  console.log('[Cron] Afternoon rate refresh…');
  try {
    await getBoGRates(true);
    await Promise.all(['USD', 'GBP', 'EUR'].map(c => getBankRates(c, true)));
  } catch (e) { console.error('[Cron] Afternoon refresh failed:', e.message); }
});

// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🇬🇭 Ghana FX Tracker API running on port ${PORT}`);
  console.log(`   /api/rates         — full rate comparison`);
  console.log(`   /api/rates/bog     — BoG interbank only`);
  console.log(`   /api/rates/banks   — commercial banks`);
  console.log(`   /api/rates/convert — currency converter`);
  console.log(`   /api/status        — health check\n`);

  // Warm cache on startup
  console.log('[Startup] Warming cache…');
  getBoGRates().catch(e => console.warn('[Startup] BoG warm failed:', e.message));
});

module.exports = app;
