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

    // Paginate through results (up to 3 pages = ~120 listings per area)
    for (let page = 1; page <= 3; page++) {
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

          const address = prop.address || prop.street_address || '';
          const amenities = extractAmenities(prop);

          allListings.push({
            source: 'zillow',
            id: `zillow-${prop.zpid}`,
            zpid: prop.zpid,
            address: typeof address === 'object' ? address.full || `${address.street}, ${address.city}, ${address.state} ${address.zip}` : address,
            addressNormalized: normalizeAddress(typeof address === 'object' ? address.full || address.street || '' : address),
            neighborhood: prop.neighborhood || (typeof address === 'object' ? address.neighborhood || '' : ''),
            region: area.region,
            city: area.location,
            zipCode: typeof address === 'object' ? address.zip || '' : prop.zipcode || prop.zip || '',
            lat: prop.latitude || prop.lat || null,
            lng: prop.longitude || prop.lng || null,
            rent: prop.price || prop.rent || 0,
            bedrooms,
            bathrooms: prop.baths || prop.bathrooms || 0,
            sqft: prop.sqft || prop.living_area || prop.livingArea || null,
            photo: prop.photos?.[0] || prop.imgSrc || prop.image || '',
            url: prop.url || prop.zillow_url || `https://www.zillow.com/homedetails/${prop.zpid}_zpid/`,
            amenities,
            listingDate: prop.listing_date || prop.listingDateTime || null,
            raw: prop,
          });
        }

        // Stop paginating if we got fewer results than a full page
        if (results.length < 40) break;

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
