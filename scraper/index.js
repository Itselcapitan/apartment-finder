require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { fetchZillowListings } = require('./fetch-zillow');
const { fetchApartmentsListings } = require('./fetch-apartments');
const { deduplicateListings } = require('./deduplicate');
const { calculateCommuteTimes } = require('./commute');
const { scoreListings } = require('./score');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LISTINGS_PATH = path.join(DATA_DIR, 'listings.json');
const DOCS_LISTINGS_PATH = path.join(__dirname, '..', 'docs', 'listings.json');

const MAX_BUDGET_PER_PERSON = 2500;
const MAX_GROUP_SIZE = 6;
const MAX_COMMUTE_MINUTES = 45;
const MIN_BEDROOMS = 3;

function applyHardFilters(listings) {
  const maxRent = MAX_BUDGET_PER_PERSON * MAX_GROUP_SIZE; // Filter at max group size
  const before = listings.length;

  const filtered = listings.filter(l => {
    if (l.rent > maxRent) return false;
    if (l.rent <= 0) return false;
    if (!l.amenities.laundryInUnit) return false;
    if (l.bedrooms < MIN_BEDROOMS) return false;
    if (l.commuteMinutes != null && l.commuteMinutes > MAX_COMMUTE_MINUTES) return false;
    return true;
  });

  console.log(`[Filter] ${before} → ${filtered.length} after hard filters`);
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
    console.error('Missing GOOGLE_MAPS_API_KEY. Set it in .env or as an environment variable.');
    process.exit(1);
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

  // 3. Calculate commute times
  await calculateCommuteTimes(deduplicated, googleMapsKey);

  // 4. Apply hard filters
  const filtered = applyHardFilters(deduplicated);

  // 5. Score listings for each group size
  scoreListings(filtered, [3, 4, 5, 6]);

  // 6. Sort by default score (group of 4) descending
  filtered.sort((a, b) => (b.scores?.[4] || 0) - (a.scores?.[4] || 0));

  // 7. Strip raw data to keep JSON smaller
  const output = filtered.map(l => {
    const { raw, ...clean } = l;
    return clean;
  });

  // 8. Write output
  const result = {
    lastUpdated: new Date().toISOString(),
    totalListings: output.length,
    filters: {
      maxBudgetPerPerson: MAX_BUDGET_PER_PERSON,
      maxGroupSize: MAX_GROUP_SIZE,
      maxCommuteMinutes: MAX_COMMUTE_MINUTES,
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
