const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'commute-cache.json');
const DESTINATION = '1500 Harbor Blvd, Weehawken, NJ 07086';

// Monday 9am ET — use next Monday
function getNextMondayAt9am() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(14, 0, 0, 0); // 9am ET = 14:00 UTC (EST+5)
  if (monday <= now) monday.setUTCDate(monday.getUTCDate() + 7);
  return Math.floor(monday.getTime() / 1000);
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch {
    // ignore corrupt cache
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function calculateCommuteTimes(listings, apiKey) {
  const cache = loadCache();
  const departureTime = getNextMondayAt9am();
  let apiCalls = 0;

  for (const listing of listings) {
    const cacheKey = listing.addressNormalized || listing.address;

    // Check cache first
    if (cache[cacheKey]) {
      listing.commuteMinutes = cache[cacheKey].minutes;
      listing.commuteText = cache[cacheKey].text;
      continue;
    }

    // Need origin — use address or lat/lng
    const origin = listing.lat && listing.lng
      ? `${listing.lat},${listing.lng}`
      : listing.address;

    if (!origin) {
      listing.commuteMinutes = null;
      listing.commuteText = 'Unknown';
      continue;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: origin,
          destinations: DESTINATION,
          mode: 'transit',
          departure_time: departureTime,
          key: apiKey,
        },
      });

      const element = response.data?.rows?.[0]?.elements?.[0];
      if (element?.status === 'OK') {
        const minutes = Math.round(element.duration.value / 60);
        const text = element.duration.text;
        listing.commuteMinutes = minutes;
        listing.commuteText = text;
        cache[cacheKey] = { minutes, text, address: listing.address };
      } else {
        listing.commuteMinutes = null;
        listing.commuteText = 'Not available';
      }

      apiCalls++;
      // Small delay to respect rate limits
      if (apiCalls % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`[Commute] Error for "${listing.address}":`, err.message);
      listing.commuteMinutes = null;
      listing.commuteText = 'Error';
    }
  }

  saveCache(cache);
  console.log(`[Commute] Calculated ${apiCalls} new commute times (${Object.keys(cache).length} total cached)`);
  return listings;
}

module.exports = { calculateCommuteTimes };
