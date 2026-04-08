# Apartment Finder

A static apartment finder web app for Manhattan, Hoboken, and Jersey City. Fetches listings from Zillow and Apartments.com via RapidAPI, scores them with a composite algorithm, and serves everything as a GitHub Pages site — no backend needed.

## Features

- **Multi-source listings** from Zillow and Apartments.com (via RapidAPI)
- **Smart scoring** (0–100) based on price, commute, amenities, nightlife proximity, and geography
- **Group size toggle** (3–6 people) that recalculates per-person rent, budget cap, and scores live
- **Filters**: price/person, commute time, bedrooms, neighborhood, amenities
- **Sort by**: score, price, commute, newest
- **Daily auto-refresh** via GitHub Actions cron job
- **Commute caching** to minimize Google Maps API calls

## Quick Start

### 1. Get API Keys

**RapidAPI** (covers Zillow + Apartments.com):
1. Sign up at [rapidapi.com](https://rapidapi.com)
2. Subscribe to [Zillow Working API](https://rapidapi.com/apimaker/api/zillow-com1) (free tier: 100 req/month)
3. Subscribe to an [Apartments.com API](https://rapidapi.com/search/apartments.com) (free tier varies)
4. Copy your RapidAPI key from any subscribed API's "Code Snippets" section

**Google Maps Distance Matrix**:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Enable the [Distance Matrix API](https://console.cloud.google.com/apis/library/distance-matrix-backend.googleapis.com)
4. Create an API key under Credentials
5. Restrict the key to "Distance Matrix API" only
6. You get $200/month free credit — more than enough for this app

### 2. Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/apartment-finder.git
cd apartment-finder

# Create .env from template
cp .env.example .env
# Edit .env and add your API keys

# Install scraper dependencies
cd scraper
npm install

# Run the scraper
node index.js

# Open the frontend
open ../docs/index.html
```

### 3. GitHub Pages Deployment

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Set source to "Deploy from a branch", branch `main`, folder `/docs`
4. Your site will be live at `https://YOUR_USERNAME.github.io/apartment-finder/`

### 4. Configure GitHub Actions Secrets

For the daily auto-refresh to work:

1. Go to **Settings → Secrets and variables → Actions**
2. Add these repository secrets:
   - `RAPIDAPI_KEY` — your RapidAPI key
   - `GOOGLE_MAPS_API_KEY` — your Google Maps key

The workflow runs daily at 8am EST and can also be triggered manually from the Actions tab.

## Project Structure

```
apartment-finder/
├── .github/workflows/
│   └── update-listings.yml     # Daily cron + manual trigger
├── data/
│   ├── listings.json           # Scraper output
│   └── commute-cache.json      # Cached commute times by address
├── docs/                       # GitHub Pages frontend
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── listings.json           # Copy of data for GitHub Pages
├── scraper/
│   ├── index.js                # Orchestrator
│   ├── fetch-zillow.js         # Zillow RapidAPI client
│   ├── fetch-apartments.js     # Apartments.com RapidAPI client
│   ├── deduplicate.js          # Cross-reference by address
│   ├── commute.js              # Google Maps + cache
│   └── score.js                # Scoring engine
├── .env.example
└── README.md
```

## Scoring System

Composite 0–100 score using weighted min-max normalization:

| Factor | Weight | Logic |
|---|---|---|
| Price per person | 25% | Lower = better |
| Price per sqft | 15% | Lower = better |
| Price per bedroom | 15% | Lower = better |
| Commute time | 15% | Shorter = better |
| Doorman | 8% | Binary bonus |
| Amenities (gym/pool/rooftop/terrace) | 7% | 1.75% per amenity |
| Private outdoor space | 5% | Balcony or terrace |
| Nightlife proximity | 5% | Within 1 mi of Hell's Kitchen, LES, East Village |
| Geography | 5% | Manhattan > Hoboken > Jersey City |

## Hard Filters

Listings are excluded if they fail any of these:
- Rent > $2,500 × group size
- No in-unit laundry
- < 3 bedrooms
- Commute to 1500 Harbor Blvd, Weehawken > 45 minutes (transit, Monday 9am)
