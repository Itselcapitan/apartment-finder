const axios = require('axios');

const RAPIDAPI_HOST = 'zillow-com1.p.rapidapi.com';

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
    try {
      const response = await axios.get('https://zillow-com1.p.rapidapi.com/propertyExtendedSearch', {
        params: {
          location: area.location,
          status_type: 'ForRent',
          home_type: 'Apartments',
          bedsMin: 3,
          sort: 'Newest',
        },
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      });

      const results = response.data?.props || [];
      console.log(`[Zillow] Found ${results.length} listings in ${area.location}`);

      for (const prop of results) {
        const bedrooms = prop.bedrooms || 0;
        if (bedrooms < 3) continue;

        const amenities = extractAmenities(prop);

        allListings.push({
          source: 'zillow',
          id: `zillow-${prop.zpid}`,
          zpid: prop.zpid,
          address: prop.address || '',
          addressNormalized: normalizeAddress(prop.address || ''),
          neighborhood: prop.address ? prop.address.split(',')[0] : '',
          region: area.region,
          city: area.location,
          zipCode: prop.zipcode || '',
          lat: prop.latitude || null,
          lng: prop.longitude || null,
          rent: prop.price || 0,
          bedrooms,
          bathrooms: prop.bathrooms || 0,
          sqft: prop.livingArea || null,
          photo: prop.imgSrc || '',
          url: `https://www.zillow.com/homedetails/${prop.zpid}_zpid/`,
          amenities,
          listingDate: prop.listingDateTime || null,
          raw: prop,
        });
      }
    } catch (err) {
      console.error(`[Zillow] Error fetching ${area.location}:`, err.response?.status, err.response?.data?.message || err.message);
    }
  }

  console.log(`[Zillow] Total listings: ${allListings.length}`);
  return allListings;
}

module.exports = { fetchZillowListings, normalizeAddress };
