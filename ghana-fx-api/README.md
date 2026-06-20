# Ghana FX Tracker API

Backend scraper for the [Labari](https://labarijournal.com) Ghana FX Tracker.

## What it does

- Scrapes **Bank of Ghana** interbank FX rates from `bog.gov.gh` daily
- Attempts live HTML scrapes of **16 commercial bank** rate pages
- For banks whose sites block scraping, estimates rates using BoG mid + observed spread profiles per bank tier
- Caches results (BoG: 30 min, banks: 15 min) to avoid hammering upstream sites
- Auto-refreshes via cron at 09:15 and 15:45 Accra time (Mon–Fri)

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/rates?currency=USD` | Full comparison: BoG + all banks |
| `GET /api/rates/bog` | BoG interbank rates only (all currencies) |
| `GET /api/rates/banks?currency=USD` | Commercial bank rates only |
| `GET /api/rates/convert?amount=100&direction=buy&bank=gcb&currency=USD` | Currency converter |
| `POST /api/rates/refresh` | Force cache bust + re-fetch |
| `GET /api/status` | Health check + cache metadata |

**Supported currencies:** USD, GBP, EUR, CHF, CAD, AUD, JPY

## Run locally

```bash
npm install
npm start
# API available at http://localhost:3001
```

## Deploy to Render / Railway / Fly.io

This is a standard Node.js Express app. Set `PORT` env var if needed.

### Render (recommended — free tier works)
1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env var: `PORT=3001`

### Environment variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP port |

## Data sources and accuracy

| Bank | Data source | Method |
|------|------------|--------|
| Bank of Ghana | bog.gov.gh | Live HTML scrape |
| GCB Bank | gcbbank.com.gh | Live HTML scrape (may be JS-gated) |
| Absa Ghana | absa.com.gh/pdf/daily-rates.pdf | Live HTML scrape |
| Ecobank Ghana | ecobank.com/gh | Live HTML scrape |
| Stanbic Bank | stanbicbank.com.gh | Live HTML scrape |
| Standard Chartered | sc.com/gh | Live HTML scrape |
| Fidelity Bank | fidelitybank.com.gh | Live HTML scrape |
| CBG, Republic, CalBank, Access, Zenith, GTBank, UBA, FAB, ADB, Prudential | — | Estimated from BoG mid + spread profile |

**Estimated rates** are computed as:
```
bank_mid   = BoG_mid × (1 + bank_premium%)
half_spread = bank_mid × spread% / 200
buying     = bank_mid − half_spread
selling    = bank_mid + half_spread
```

Spread profiles are based on historical observation of published rate sheets. All estimated rates are clearly flagged as `"dataType": "estimated"` in the API response.

## Improving live coverage

For banks that block HTML scraping:
- **Absa**: publishes a daily PDF at `/content/dam/ghana/absa/pdf/daily-rates.pdf` — add PDF parsing with `pdf-parse`
- **Others**: submit partnership request for API access, or use a browser automation tool (Playwright) for JS-rendered pages

## Legal

Rates are sourced from publicly available bank rate sheets and Bank of Ghana publications. This is a journalistic/informational tool. Always confirm rates directly with your bank before transacting.
