const axios = require('axios');

const RAPIDAPI_HOST = 'zillow-real-estate-api.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/v1`;

const SEARCH_AREAS = [
  // Manhattan — search by neighborhood to get more results
  { location: 'Midtown, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Upper West Side, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Upper East Side, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Hell\'s Kitchen, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Chelsea, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'West Village, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'East Village, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Harlem, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Hudson Yards, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Lower East Side, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Financial District, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'SoHo, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Tribeca, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Gramercy Park, Manhattan, New York, NY', region: 'Manhattan' },
  { location: 'Washington Heights, Manhattan, New York, NY', region: 'Manhattan' },
  // NJ
  { location: 'Hoboken, NJ', region: 'Hoboken' },
  { location: 'Jersey City, NJ', region: 'Jersey City' },
  { location: 'Weehawken, NJ', region: 'Weehawken' },
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
  const seenZpids = new Set();

  for (let areaIdx = 0; areaIdx < SEARCH_AREAS.length; areaIdx++) {
    const area = SEARCH_AREAS[areaIdx];
    console.log(`[Zillow] Fetching rentals in ${area.location}...`);

    // Delay between search areas to avoid 429 rate limits
    if (areaIdx > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    // Paginate — fewer pages for Manhattan neighborhoods (smaller areas), more for NJ
    const maxPages = area.region === 'Manhattan' ? 3 : 5;
    for (let page = 1; page <= maxPages; page++) {
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
          // Skip duplicates across neighborhood searches
          if (prop.zpid && seenZpids.has(prop.zpid)) continue;
          if (prop.zpid) seenZpids.add(prop.zpid);

          const bedrooms = prop.beds || prop.bedrooms || 0;
          if (bedrooms < 3) continue;

          const fullAddress = prop.address || `${prop.street_address || ''}, ${prop.city || ''}, ${prop.state || ''} ${prop.zipcode || ''}`;
          const amenities = extractAmenities(prop);

          // Determine actual region from address/city, not search area
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
        await new Promise(r => setTimeout(r, 3000));

      } catch (err) {
        const status = err.response?.status;
        if (status === 429) {
          console.warn(`[Zillow] Rate limited on ${area.location} page ${page}, waiting 10s...`);
          await new Promise(r => setTimeout(r, 10000));
          // Retry once
          try {
            const retry = await axios.get(`${BASE_URL}/search`, {
              params: { location: area.location, status: 'for_rent', beds_min: 3, sort: 'newest', page },
              headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
            });
            const retryResults = retry.data?.data?.results || [];
            console.log(`[Zillow] Retry page ${page}: ${retryResults.length} listings`);
            for (const prop of retryResults) {
              if (prop.zpid && seenZpids.has(prop.zpid)) continue;
              if (prop.zpid) seenZpids.add(prop.zpid);
              const bedrooms = prop.beds || prop.bedrooms || 0;
              if (bedrooms < 3) continue;
              const fullAddress = prop.address || `${prop.street_address || ''}, ${prop.city || ''}, ${prop.state || ''} ${prop.zipcode || ''}`;
              const region = detectRegion(fullAddress, prop.city, prop.state, prop.zipcode);
              if (!region) continue;
              const photoUrl = prop.image_url || prop.photos?.[0]?.urls?.large || prop.photos?.[0]?.urls?.medium || '';
              allListings.push({
                source: 'zillow', id: `zillow-${prop.zpid}`, zpid: prop.zpid,
                address: fullAddress, addressNormalized: normalizeAddress(fullAddress),
                neighborhood: prop.neighborhood || '', region, city: prop.city || '',
                zipCode: prop.zipcode || '', lat: prop.latitude || null, lng: prop.longitude || null,
                rent: prop.price || 0, bedrooms, bathrooms: prop.baths || 0, sqft: prop.sqft || null,
                photo: photoUrl, url: prop.detail_url || `https://www.zillow.com/homedetails/${prop.zpid}_zpid/`,
                amenities: extractAmenities(prop), listingDate: null, daysOnZillow: prop.days_on_zillow || null,
                raw: prop,
              });
            }
            if (retryResults.length < 40) break;
          } catch (retryErr) {
            console.error(`[Zillow] Retry failed for ${area.location} page ${page}:`, retryErr.response?.status);
            break;
          }
        } else {
          console.error(`[Zillow] Error fetching ${area.location} page ${page}:`, status, err.response?.data?.error?.message || err.message);
          break;
        }
      }
    }
  }

  console.log(`[Zillow] Total listings: ${allListings.length}`);
  return allListings;
}

module.exports = { fetchZillowListings, normalizeAddress };
