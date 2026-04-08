require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { fetchZillowListings } = require('./fetch-zillow');
const { fetchApartmentsListings } = require('./fetch-apartments');
const { deduplicateListings } = require('./deduplicate');
const { calculateCommuteTimes } = require('./commute');
const { scoreListings } = require('./score');
const { assignNeighborhoods } = require('./neighborhoods');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LISTINGS_PATH = path.join(DATA_DIR, 'listings.json');
const DOCS_LISTINGS_PATH = path.join(__dirname, '..', 'docs', 'listings.json');

const MAX_BUDGET_PER_PERSON = 2500;
const MAX_GROUP_SIZE = 6;
const MIN_BEDROOMS = 3;

// Commute limits by region — Manhattan transit to Weehawken is longer
const MAX_COMMUTE_BY_REGION = {
  Manhattan: 60,     // Transit across the Hudson takes longer
  Hoboken: 45,
  Weehawken: 45,
  'Jersey City': 45,
  'Other NJ': 35,    // Only include if it's a short commute
};
const DEFAULT_MAX_COMMUTE = 45;

// Minimum score threshold for non-priority regions (group of 4)
// Manhattan and Hoboken always show; others need to earn their spot
const MIN_SCORE_BY_REGION = {
  Manhattan: 0,       // Always show
  Hoboken: 0,         // Always show
  Weehawken: 0,       // Always show (it's where the office is)
  'Jersey City': 30,  // Show if decent
  'Other NJ': 45,     // Only show if good
};

function applyHardFilters(listings) {
  const maxRent = MAX_BUDGET_PER_PERSON * MAX_GROUP_SIZE;
  const before = listings.length;

  const filtered = listings.filter(l => {
    if (l.rent > maxRent) return false;
    if (l.rent <= 0) return false;
    if (l.bedrooms < MIN_BEDROOMS) return false;

    // Region-specific commute limits
    const maxCommute = MAX_COMMUTE_BY_REGION[l.region] || DEFAULT_MAX_COMMUTE;
    if (l.commuteMinutes != null && l.commuteMinutes > maxCommute) return false;

    return true;
  });

  console.log(`[Filter] ${before} → ${filtered.length} after hard filters`);
  return filtered;
}

// After scoring, remove low-scoring listings from non-priority regions
function applyScoreThresholds(listings) {
  const before = listings.length;
  const filtered = listings.filter(l => {
    const minScore = MIN_SCORE_BY_REGION[l.region] ?? 30;
    const score = l.scores?.[4] || 0;
    return score >= minScore;
  });
  console.log(`[Priority] ${before} → ${filtered.length} after score thresholds`);
  return filtered;
}

async function main() {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!rapidApiKey) {
    console.error('Missing RAPIDAPI_KEY. Set it in .env or as an environment variable.');
    process.exit(1);
  }
  if (!googleMapsKey) {
    console.warn('Warning: GOOGLE_MAPS_API_KEY not set. Commute times will be skipped.');
  }

  console.log('=== Apartment Finder Scraper ===\n');

  // 1. Fetch from both sources
  const [zillowListings, apartmentsListings] = await Promise.all([
    fetchZillowListings(rapidApiKey),
    fetchApartmentsListings(rapidApiKey),
  ]);

  // 2. Combine and deduplicate
  const all = [...zillowListings, ...apartmentsListings];
  const deduplicated = deduplicateListings(all);

  // 3. Assign neighborhoods based on lat/lng
  assignNeighborhoods(deduplicated);

  // 4. Calculate commute times (skip if no API key)
  if (googleMapsKey) {
    await calculateCommuteTimes(deduplicated, googleMapsKey);
  } else {
    console.log('[Commute] Skipped — no Google Maps API key');
  }

  // 5. Apply hard filters (budget, bedrooms, commute)
  const filtered = applyHardFilters(deduplicated);

  // 6. Score listings for each group size
  scoreListings(filtered, [3, 4, 5, 6]);

  // 7. Apply score thresholds for non-priority areas
  const prioritized = applyScoreThresholds(filtered);

  // 8. Sort: priority regions first, then by score
  const REGION_PRIORITY = { Manhattan: 0, Hoboken: 1, Weehawken: 2, 'Jersey City': 3, 'Other NJ': 4 };
  prioritized.sort((a, b) => {
    const pa = REGION_PRIORITY[a.region] ?? 5;
    const pb = REGION_PRIORITY[b.region] ?? 5;
    if (pa !== pb) return pa - pb;
    return (b.scores?.[4] || 0) - (a.scores?.[4] || 0);
  });

  // 9. Strip raw data to keep JSON smaller
  const output = prioritized.map(l => {
    const { raw, ...clean } = l;
    return clean;
  });

  // Log region breakdown
  const regionCounts = {};
  output.forEach(l => { regionCounts[l.region] = (regionCounts[l.region] || 0) + 1; });
  console.log('[Regions]', regionCounts);

  // 10. Write output
  const result = {
    lastUpdated: new Date().toISOString(),
    totalListings: output.length,
    filters: {
      maxBudgetPerPerson: MAX_BUDGET_PER_PERSON,
      maxGroupSize: MAX_GROUP_SIZE,
      maxCommuteByRegion: MAX_COMMUTE_BY_REGION,
      minBedrooms: MIN_BEDROOMS,
    },
    listings: output,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LISTINGS_PATH, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${output.length} listings to ${LISTINGS_PATH}`);

  // Also copy to docs/ for GitHub Pages
  fs.writeFileSync(DOCS_LISTINGS_PATH, JSON.stringify(result, null, 2));
  console.log(`Copied to ${DOCS_LISTINGS_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
