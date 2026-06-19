/**
 * Commercial Bank Scrapers — all 23 BoG-licensed commercial banks
 *
 * Full list (Bank of Ghana, late 2024):
 *  Absa, Access, ADB, Bank of Africa, CalBank, Consolidated Bank Ghana,
 *  Ecobank, FBNBank, Fidelity, First Atlantic, First National Bank (FNB/RMB),
 *  GCB, GTBank, NIB, OmniBSIC, Prudential, Republic, Société Générale,
 *  Stanbic, Standard Chartered, UBA, Universal Merchant Bank, Zenith
 *
 * Strategy:
 *  - Banks with parseable public rate pages → live HTML scrape
 *  - All others → rate estimation via rateBlender (clearly flagged)
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const HTTP = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

/**
 * Generic HTML table parser — detects currency rows and extracts buy/sell pairs.
 */
function parseRatesFromTable($) {
  const rates = {};

  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells   = $(row).find('td');
      if (cells.length < 3) return;

      const rowText = $(row).text().toUpperCase();
      let code = null;

      if      (rowText.includes('US DOLLAR') || rowText.includes('USD'))  code = 'USD';
      else if (rowText.includes('POUND')      || rowText.includes('GBP'))  code = 'GBP';
      else if (rowText.includes('EURO')       || rowText.includes('EUR'))  code = 'EUR';
      else if (rowText.includes('SWISS')      || rowText.includes('CHF'))  code = 'CHF';
      else if (rowText.includes('CANADIAN')   || rowText.includes('CAD'))  code = 'CAD';
      else if (rowText.includes('YEN')        || rowText.includes('JPY'))  code = 'JPY';
      else return;

      const nums = [];
      cells.each((_, cell) => {
        const val = parseFloat($(cell).text().trim().replace(/,/g, ''));
        if (!isNaN(val) && val > 0.001) nums.push(val);
      });

      const candidates = nums.filter(n => n > 0.01);
      if (candidates.length >= 2) {
        rates[code] = {
          buying:  Math.min(candidates[0], candidates[1]),
          selling: Math.max(candidates[0], candidates[1]),
        };
      }
    });
  });

  return Object.keys(rates).length > 0 ? rates : null;
}

// ─── Individual scrapers (attempt live; fail gracefully) ──────────

async function scrapeGCB() {
  try {
    const res = await HTTP.get('https://www.gcbbank.com.gh/87-exchange/447-foreign-exchange');
    const $ = cheerio.load(res.data);
    const rates = parseRatesFromTable($);
    if (!rates) {
      const usdMatch = $.text().match(/USD[^\d]*([\d.]+)[^\d]*([\d.]+)/i);
      if (usdMatch) return { rates: { USD: { buying: parseFloat(usdMatch[1]), selling: parseFloat(usdMatch[2]) } } };
    }
    return rates ? { rates } : null;
  } catch { return null; }
}

async function scrapeAbsa() {
  try {
    const res = await HTTP.get('https://www.absa.com.gh/personal/forex-rates/', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeEcobank() {
  try {
    const res = await HTTP.get('https://www.ecobank.com/gh/personal-banking/foreign-exchange', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeStanbic() {
  try {
    const res = await HTTP.get('https://www.stanbicbank.com.gh/ghana/personal/products-and-services/forex', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeStanChart() {
  try {
    const res = await HTTP.get('https://www.sc.com/gh/forex-rates/', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeFidelity() {
  try {
    const res = await HTTP.get('https://www.fidelitybank.com.gh/rates', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeAccess() {
  try {
    const res = await HTTP.get('https://www.accessbankghana.com/personal/resources/exchange-rates/', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeRepublic() {
  try {
    const res = await HTTP.get('https://www.republicghana.com/exchange-rates/', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeSocGen() {
  try {
    const res = await HTTP.get('https://www.societegenerale.com.gh/en/personal/forex-rates', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeZenith() {
  try {
    const res = await HTTP.get('https://www.zenithbank.com.gh/personal/forex', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeUBA() {
  try {
    const res = await HTTP.get('https://www.ubaghana.com/exchange-rates/', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

async function scrapeCalBank() {
  try {
    const res = await HTTP.get('https://www.calbank.net/exchange-rates', { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const r = parseRatesFromTable($);
    return r ? { rates: r } : null;
  } catch { return null; }
}

// ─── Full 23-bank registry ────────────────────────────────────────
const BANK_SCRAPERS = [
  // ── Scrapeable (active scraper attached) ──
  { id: 'gcb',      name: 'GCB Bank',               shortName: 'GCB', type: 'State-owned',  color: '#1A5276', scrape: scrapeGCB,      url: 'https://www.gcbbank.com.gh/87-exchange/447-foreign-exchange' },
  { id: 'absa',     name: 'Absa Ghana',              shortName: 'ABS', type: 'International', color: '#B22222', scrape: scrapeAbsa,     url: 'https://www.absa.com.gh/personal/forex-rates/' },
  { id: 'ecobank',  name: 'Ecobank Ghana',           shortName: 'ECO', type: 'Pan-African',   color: '#006400', scrape: scrapeEcobank,  url: 'https://www.ecobank.com/gh/personal-banking/foreign-exchange' },
  { id: 'stanbic',  name: 'Stanbic Bank',            shortName: 'STB', type: 'International', color: '#1F618D', scrape: scrapeStanbic,  url: 'https://www.stanbicbank.com.gh/ghana/personal/products-and-services/forex' },
  { id: 'scb',      name: 'Standard Chartered',      shortName: 'SCB', type: 'International', color: '#00529B', scrape: scrapeStanChart, url: 'https://www.sc.com/gh/forex-rates/' },
  { id: 'fidelity', name: 'Fidelity Bank',           shortName: 'FID', type: 'Commercial',    color: '#7D3C98', scrape: scrapeFidelity, url: 'https://www.fidelitybank.com.gh/rates' },
  { id: 'access',   name: 'Access Bank Ghana',       shortName: 'ACC', type: 'Pan-African',   color: '#E74C3C', scrape: scrapeAccess,   url: 'https://www.accessbankghana.com/personal/resources/exchange-rates/' },
  { id: 'republic', name: 'Republic Bank Ghana',     shortName: 'REP', type: 'Commercial',    color: '#117A65', scrape: scrapeRepublic, url: 'https://www.republicghana.com/exchange-rates/' },
  { id: 'socgen',   name: 'Société Générale Ghana',  shortName: 'SGA', type: 'International', color: '#CC0000', scrape: scrapeSocGen,   url: 'https://www.societegenerale.com.gh/en/personal/forex-rates' },
  { id: 'zenith',   name: 'Zenith Bank Ghana',       shortName: 'ZEN', type: 'Commercial',    color: '#4A235A', scrape: scrapeZenith,   url: 'https://www.zenithbank.com.gh/personal/forex' },
  { id: 'uba',      name: 'UBA Ghana',               shortName: 'UBA', type: 'Pan-African',   color: '#A93226', scrape: scrapeUBA,      url: 'https://www.ubaghana.com/exchange-rates/' },
  { id: 'calbank',  name: 'CalBank',                 shortName: 'CAL', type: 'Commercial',    color: '#884EA0', scrape: scrapeCalBank,  url: 'https://www.calbank.net/exchange-rates' },

  // ── Estimate-only (no public machine-readable rate page) ──
  { id: 'adb',      name: 'Agricultural Dev. Bank',  shortName: 'ADB', type: 'State-owned',   color: '#196F3D', scrape: null, url: null },
  { id: 'boagh',    name: 'Bank of Africa Ghana',    shortName: 'BOA', type: 'Pan-African',   color: '#00539C', scrape: null, url: null },
  { id: 'cbg',      name: 'Consolidated Bank Ghana', shortName: 'CBG', type: 'State-owned',   color: '#CA6F1E', scrape: null, url: null },
  { id: 'fbnbank',  name: 'FBNBank Ghana',           shortName: 'FBN', type: 'Commercial',    color: '#1C4E80', scrape: null, url: null },
  { id: 'fab',      name: 'First Atlantic Bank',     shortName: 'FAB', type: 'Commercial',    color: '#148F77', scrape: null, url: null },
  { id: 'fnb',      name: 'First National Bank',     shortName: 'FNB', type: 'International', color: '#C0392B', scrape: null, url: null },
  { id: 'gtbank',   name: 'GTBank Ghana',            shortName: 'GTB', type: 'Commercial',    color: '#F39C12', scrape: null, url: null },
  { id: 'nib',      name: 'National Investment Bank',shortName: 'NIB', type: 'State-owned',   color: '#1A6B4A', scrape: null, url: null },
  { id: 'omnibsic', name: 'OmniBSIC Bank',           shortName: 'OMN', type: 'Commercial',    color: '#2E4057', scrape: null, url: null },
  { id: 'pru',      name: 'Prudential Bank',         shortName: 'PRU', type: 'Commercial',    color: '#5D6D7E', scrape: null, url: null },
  { id: 'umb',      name: 'Universal Merchant Bank', shortName: 'UMB', type: 'Commercial',    color: '#6E2F8B', scrape: null, url: null },
];

/**
 * Run all scrapers in parallel with per-scraper timeout.
 */
async function scrapeAllBanks() {
  const results = await Promise.allSettled(
    BANK_SCRAPERS.map(async (bank) => {
      if (!bank.scrape) return { bank, rates: null, scraped: false };
      try {
        const result = await Promise.race([
          bank.scrape(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ]);
        return { bank, rates: result?.rates || null, scraped: !!result?.rates };
      } catch {
        return { bank, rates: null, scraped: false };
      }
    })
  );

  return results.map(r => r.status === 'fulfilled' ? r.value : { bank: null, rates: null, scraped: false });
}

module.exports = { BANK_SCRAPERS, scrapeAllBanks };
