/**
 * Rate Blending & Estimation
 *
 * For banks without scrapeable pages, estimates rates using:
 *   bank_mid   = BoG_mid × (1 + premiumPct / 100)
 *   half_spread = bank_mid × spreadPct / 200
 *   buying     = bank_mid − half_spread
 *   selling    = bank_mid + half_spread
 *
 * Premium and spread values are tuned per-bank from historical rate sheet observations.
 */

const SPREAD_PROFILES = {
  'State-owned':   { premiumPct: 0.7,  spreadPct: 1.3 },
  'Commercial':    { premiumPct: 1.0,  spreadPct: 2.2 },
  'International': { premiumPct: 1.3,  spreadPct: 3.0 },
  'Pan-African':   { premiumPct: 1.1,  spreadPct: 2.4 },
};

// Per-bank tuning based on historical public rate sheet observations
const BANK_PREMIUMS = {
  gcb:      { premiumPct: 0.8,  spreadPct: 1.4 },
  absa:     { premiumPct: 1.2,  spreadPct: 2.8 },
  ecobank:  { premiumPct: 1.0,  spreadPct: 2.2 },
  stanbic:  { premiumPct: 1.3,  spreadPct: 3.0 },
  scb:      { premiumPct: 1.5,  spreadPct: 3.2 },
  fidelity: { premiumPct: 0.9,  spreadPct: 1.8 },
  access:   { premiumPct: 1.1,  spreadPct: 2.5 },
  republic: { premiumPct: 1.0,  spreadPct: 2.0 },
  socgen:   { premiumPct: 1.2,  spreadPct: 2.9 },
  zenith:   { premiumPct: 1.1,  spreadPct: 2.4 },
  uba:      { premiumPct: 1.1,  spreadPct: 2.3 },
  calbank:  { premiumPct: 1.1,  spreadPct: 2.3 },
  adb:      { premiumPct: 0.6,  spreadPct: 1.2 },  // ADB state-owned, tightest spread
  boagh:    { premiumPct: 1.1,  spreadPct: 2.4 },
  cbg:      { premiumPct: 0.7,  spreadPct: 1.3 },  // State-owned, tight
  fbnbank:  { premiumPct: 1.1,  spreadPct: 2.3 },
  fab:      { premiumPct: 1.0,  spreadPct: 2.0 },
  fnb:      { premiumPct: 1.3,  spreadPct: 3.1 },  // FNB/FirstRand — international
  gtbank:   { premiumPct: 1.0,  spreadPct: 2.1 },
  nib:      { premiumPct: 0.7,  spreadPct: 1.4 },  // NIB state-owned
  omnibsic: { premiumPct: 1.0,  spreadPct: 2.1 },
  pru:      { premiumPct: 1.0,  spreadPct: 2.0 },
  umb:      { premiumPct: 1.0,  spreadPct: 2.2 },
};

function estimateRates(bankId, bankType, bogMid) {
  const profile    = BANK_PREMIUMS[bankId] || SPREAD_PROFILES[bankType] || SPREAD_PROFILES['Commercial'];
  const premiumPct = profile.premiumPct ?? 1.0;
  const spreadPct  = profile.spreadPct  ?? 2.5;

  const mid  = +(bogMid * (1 + premiumPct / 100)).toFixed(4);
  const half = +(mid * spreadPct / 200).toFixed(4);

  return {
    buying:   +(mid - half).toFixed(4),
    selling:  +(mid + half).toFixed(4),
    mid,
    dataType: 'estimated',
  };
}

function buildBankRates(scrapedResults, bogRates, currency = 'USD') {
  const bogMid = bogRates[currency]?.mid ?? bogRates[currency]?.buying;
  if (!bogMid) return [];

  return scrapedResults
    .filter(r => r.bank)
    .map(({ bank, rates, scraped }) => {
      let rateData;

      if (scraped && rates && rates[currency]) {
        const r = rates[currency];
        rateData = {
          buying:   +r.buying.toFixed(4),
          selling:  +r.selling.toFixed(4),
          mid:      +((r.buying + r.selling) / 2).toFixed(4),
          dataType: 'live',
        };
      } else {
        rateData = estimateRates(bank.id, bank.type, bogMid);
      }

      const spread    = +(rateData.selling - rateData.buying).toFixed(4);
      const spreadPct = +((spread / rateData.mid) * 100).toFixed(2);

      return {
        id:        bank.id,
        name:      bank.name,
        shortName: bank.shortName,
        type:      bank.type,
        color:     bank.color,
        rateSource: bank.url,
        ...rateData,
        spread,
        spreadPct,
      };
    });
}

module.exports = { buildBankRates, estimateRates };
