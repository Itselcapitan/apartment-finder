const axios = require('axios');

const RAPIDAPI_HOST = 'zillow-real-estate-api.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v1`;

const SEARCH_AREAS = [
  { location: 'Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Hoboken, NJ', region: 'Hoboken' },
  { location: 'Jersey City, NJ', region: 'Jersey City' },
];

function normalizeAddress(addr) {
  return addr
    .toLowerCase()
    .replace(/\bapt\.?\s*#?\s*\w+/gi, '')
    .replace(/\bunit\s*#?\s*\w+/gi, '')
    .replace(/\bste\.?\s*#?\s*\w+/gi, '')
    .replace(/\b#\s*\w+/g, '')
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Detect actual region from address text — Zillow search returns results outside the search area
function detectRegion(address, city, state, zip) {
  const addr = (address || '').toLowerCase();
  const c = (city || '').toLowerCase();
  const s = (state || '').toUpperCase();

  // Jersey City
  if (c.includes('jersey city') || addr.includes('jersey city')) return 'Jersey City';
  // Hoboken
  if (c.includes('hoboken') || addr.includes('hoboken')) return 'Hoboken';
  // Weehawken
  if (c.includes('weehawken') || addr.includes('weehawken')) return 'Weehawken';
  // Manhattan — must be New York, NY and in Manhattan zip codes or borough
  if ((c === 'new york' || c === 'manhattan') && s === 'NY') {
    // Manhattan zip codes: 100xx-102xx
    if (zip && /^10[012]\d{2}$/.test(zip)) return 'Manhattan';
    return 'Manhattan'; // Default for New York, NY
  }
  // Other NYC boroughs (Brooklyn, Queens, Bronx, Staten Island) — skip
  if (s === 'NY' && c !== 'new york' && c !== 'manhattan') return null;
  // Other NJ cities near the area
  if (s === 'NJ') return 'Other NJ';

  return null; // Not in our target areas
}

function extractAmenities(listing) {
  const text = JSON.stringify(listing).toLowerCase();
  return {
    laundryInUnit: /laundry in unit|in-unit laundry|washer.{0,10}dryer in unit|w\/d in unit/.test(text),
    doorman: /doorman|concierge|attended lobby/.test(text),
    gym: /gym|fitness center|fitness room/.test(text),
    pool: /pool|swimming/.test(text),
    rooftop: /rooftop|roof deck|roof terrace/.test(text),
    terrace: /terrace|patio|balcony|private outdoor|outdoor space/.test(text),
    balcony: /balcony|private outdoor/.test(text),
  };
}

async function fetchZillowListings(apiKey) {
  const allListings = [];

  for (const area of SEARCH_AREAS) {
    console.log(`[Zillow] Fetching rentals in ${area.location}...`);

    // Paginate through results (up to 8 pages = ~320 listings per area)
    for (let page = 1; page <= 8; page++) {
      try {
        const response = await axios.get(`${BASE_URL}/search`, {
          params: {
            location: area.location,
            status: 'for_rent',
            beds_min: 3,
            sort: 'newest',
            page,
          },
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': RAPIDAPI_HOST,
          },
        });

        const data = response.data?.data;
        const results = data?.results || [];
        console.log(`[Zillow] Page ${page}: ${results.length} listings in ${area.location}`);

        if (results.length === 0) break;

        for (const prop of results) {
          const bedrooms = prop.beds || prop.bedrooms || 0;
          if (bedrooms < 3) continue;

          const fullAddress = prop.address || `${prop.street_address || ''}, ${prop.city || ''}, ${prop.state || ''} ${prop.zipcode || ''}`;
          const amenities = extractAmenities(prop);

          // Determine actual region from address/city, not search area
          // Zillow's Manhattan search often returns NJ and outer-borough results
          const region = detectRegion(fullAddress, prop.city, prop.state, prop.zipcode);
          if (!region) continue; // Skip listings outside our target areas

          // Extract photo URL from nested photos array
          const photoUrl = prop.image_url
            || prop.photos?.[0]?.urls?.large
            || prop.photos?.[0]?.urls?.medium
            || '';

          allListings.push({
            source: 'zillow',
            id: `zillow-${prop.zpid}`,
            zpid: prop.zpid,
            address: fullAddress,
            addressNormalized: normalizeAddress(fullAddress),
            neighborhood: prop.neighborhood || '',
            region,
            city: prop.city || '',
            zipCode: prop.zipcode || '',
            lat: prop.latitude || null,
            lng: prop.longitude || null,
            rent: prop.price || 0,
            bedrooms,
            bathrooms: prop.baths || 0,
            sqft: prop.sqft || null,
            photo: photoUrl,
            url: prop.detail_url || `https://www.zillow.com/homedetails/${prop.zpid}_zpid/`,
            amenities,
            listingDate: null,
            daysOnZillow: prop.days_on_zillow || null,
            raw: prop,
          });
        }

        // Stop paginating if we got fewer results than a full page
        if (results.length < 40) break;

        // Delay between pages to avoid 429 rate limits
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`[Zillow] Error fetching ${area.location} page ${page}:`, err.response?.status, err.response?.data?.error?.message || err.message);
        break;
      }
    }
  }

  console.log(`[Zillow] Total listings: ${allListings.length}`);
  return allListings;
}

module.exports = { fetchZillowListings, normalizeAddress };
