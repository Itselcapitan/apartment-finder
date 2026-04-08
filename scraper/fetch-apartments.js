const axios = require('axios');

// Uses the Redfin Real Estate API as a second data source (same RapidAPI key)
// https://rapidapi.com/jdtpnjtp/api/redfin-real-estate-api
const RAPIDAPI_HOST = 'redfin-real-estate-api.p.rapidapi.com';
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

async function fetchApartmentsListings(apiKey) {
  const allListings = [];

  for (const area of SEARCH_AREAS) {
    console.log(`[Redfin] Fetching rentals in ${area.location}...`);
    try {
      const response = await axios.get(`${BASE_URL}/search`, {
        params: {
          location: area.location,
          status: 'for_rent',
          beds_min: 3,
          sort: 'newest',
        },
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      });

      const data = response.data?.data;
      const results = data?.results || [];
      console.log(`[Redfin] Found ${results.length} listings in ${area.location}`);

      for (const prop of results) {
        const bedrooms = prop.beds || prop.bedrooms || 0;
        if (bedrooms < 3) continue;

        const address = prop.address || prop.street_address || '';
        const fullAddress = typeof address === 'object'
          ? address.full || `${address.street || ''}, ${address.city || ''}, ${address.state || ''} ${address.zip || ''}`
          : address;

        const amenities = extractAmenities(prop);

        // Parse rent — handle various formats
        let rent = 0;
        if (typeof prop.price === 'number') {
          rent = prop.price;
        } else if (typeof prop.price === 'string') {
          const prices = prop.price.match(/[\d,]+/g);
          if (prices && prices.length > 0) {
            rent = parseInt(prices[0].replace(/,/g, ''), 10);
          }
        } else if (prop.rent) {
          rent = typeof prop.rent === 'number' ? prop.rent : parseInt(String(prop.rent).replace(/[^0-9]/g, ''), 10) || 0;
        }

        allListings.push({
          source: 'redfin',
          id: `redfin-${prop.property_id || prop.listing_id || prop.id || allListings.length}`,
          address: fullAddress,
          addressNormalized: normalizeAddress(fullAddress),
          neighborhood: prop.neighborhood || (typeof address === 'object' ? address.neighborhood || '' : ''),
          region: area.region,
          city: area.location,
          zipCode: typeof address === 'object' ? address.zip || '' : prop.zip || prop.zipcode || '',
          lat: prop.latitude || prop.lat || null,
          lng: prop.longitude || prop.lng || null,
          rent,
          bedrooms,
          bathrooms: prop.baths || prop.bathrooms || 0,
          sqft: prop.sqft || prop.square_feet || prop.living_area || null,
          photo: prop.photos?.[0] || prop.photo || prop.image || prop.imgSrc || '',
          url: prop.url || prop.redfin_url || prop.listing_url || '',
          amenities,
          listingDate: prop.listing_date || prop.list_date || null,
          raw: prop,
        });
      }
    } catch (err) {
      console.error(`[Redfin] Error fetching ${area.location}:`, err.response?.status, err.response?.data?.error?.message || err.message);
      // Redfin API may not be subscribed — continue gracefully
    }
  }

  console.log(`[Redfin] Total listings: ${allListings.length}`);
  return allListings;
}

module.exports = { fetchApartmentsListings };
