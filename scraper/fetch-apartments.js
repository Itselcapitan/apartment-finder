const axios = require('axios');

const RAPIDAPI_HOST = 'apartments-com-api.p.rapidapi.com';

const SEARCH_AREAS = [
  { location: 'Manhattan, NY', region: 'Manhattan' },
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
    console.log(`[Apartments.com] Fetching rentals in ${area.location}...`);
    try {
      // Try the apartments-com-api endpoint
      const response = await axios.get('https://apartments-com-api.p.rapidapi.com/apartments', {
        params: {
          location: area.location,
          min_bedrooms: 3,
          sort: 'default',
        },
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      });

      const results = response.data?.listings || response.data?.results || response.data || [];
      const listings = Array.isArray(results) ? results : [];
      console.log(`[Apartments.com] Found ${listings.length} listings in ${area.location}`);

      for (const prop of listings) {
        const bedrooms = prop.bedrooms || prop.beds || 0;
        if (bedrooms < 3) continue;

        const address = prop.address || prop.streetAddress || prop.formattedAddress || '';
        const amenities = extractAmenities(prop);

        // Parse rent — handle ranges like "$3,000 - $4,500"
        let rent = 0;
        const priceStr = String(prop.price || prop.rent || prop.monthlyRent || '0');
        const prices = priceStr.match(/[\d,]+/g);
        if (prices && prices.length > 0) {
          rent = parseInt(prices[0].replace(/,/g, ''), 10);
        }

        allListings.push({
          source: 'apartments.com',
          id: `apt-${prop.id || prop.listingId || allListings.length}`,
          address,
          addressNormalized: normalizeAddress(address),
          neighborhood: prop.neighborhood || '',
          region: area.region,
          city: area.location,
          zipCode: prop.zipCode || prop.zip || '',
          lat: prop.latitude || prop.lat || null,
          lng: prop.longitude || prop.lng || null,
          rent,
          bedrooms,
          bathrooms: prop.bathrooms || prop.baths || 0,
          sqft: prop.sqft || prop.squareFeet || prop.livingArea || null,
          photo: prop.photo || prop.image || prop.imageUrl || prop.photos?.[0] || '',
          url: prop.url || prop.detailUrl || prop.listingUrl || '',
          amenities,
          listingDate: prop.listingDate || prop.availableDate || null,
          raw: prop,
        });
      }
    } catch (err) {
      console.error(`[Apartments.com] Error fetching ${area.location}:`, err.response?.status, err.response?.data?.message || err.message);
      // Apartments.com API may not be available — continue gracefully
    }
  }

  console.log(`[Apartments.com] Total listings: ${allListings.length}`);
  return allListings;
}

module.exports = { fetchApartmentsListings };
