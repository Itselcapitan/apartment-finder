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

// Determine which commute modes to try based on region
// Manhattan: transit only (no driving through Lincoln Tunnel for daily commute)
// NJ (Hoboken, Jersey City): walking, driving, and transit — pick the best
function getModesForRegion(region) {
  if (region === 'Manhattan') {
    return ['transit', 'walking'];
  }
  // NJ areas — close enough to potentially walk or drive
  return ['walking', 'driving', 'transit'];
}

async function fetchCommute(origin, mode, departureTime, apiKey) {
  const params = {
    origins: origin,
    destinations: DESTINATION,
    mode,
    key: apiKey,
  };
  // departure_time only works with transit and driving
  if (mode === 'transit' || mode === 'driving') {
    params.departure_time = departureTime;
  }
  const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', { params });
  const element = response.data?.rows?.[0]?.elements?.[0];
  if (element?.status === 'OK') {
    return {
      minutes: Math.round(element.duration.value / 60),
      text: element.duration.text,
      mode,
    };
  }
  return null;
}

async function calculateCommuteTimes(listings, apiKey) {
  const cache = loadCache();
  const departureTime = getNextMondayAt9am();
  let apiCalls = 0;

  for (const listing of listings) {
    const cacheKey = listing.addressNormalized || listing.address;

    // Check cache first (v2 cache has mode info)
    if (cache[cacheKey] && cache[cacheKey].mode) {
      listing.commuteMinutes = cache[cacheKey].minutes;
      listing.commuteText = cache[cacheKey].text;
      listing.commuteMode = cache[cacheKey].mode;
      continue;
    }

    const origin = listing.lat && listing.lng
      ? `${listing.lat},${listing.lng}`
      : listing.address;

    if (!origin) {
      listing.commuteMinutes = null;
      listing.commuteText = 'Unknown';
      listing.commuteMode = null;
      continue;
    }

    try {
      const modes = getModesForRegion(listing.region);
      let best = null;

      for (const mode of modes) {
        const result = await fetchCommute(origin, mode, departureTime, apiKey);
        apiCalls++;
        if (result && (!best || result.minutes < best.minutes)) {
          best = result;
        }
        // If walking is under 30 min, that's great — no need to check more
        if (best && best.mode === 'walking' && best.minutes <= 30) break;
      }

      if (best) {
        listing.commuteMinutes = best.minutes;
        listing.commuteText = best.text;
        listing.commuteMode = best.mode;
        cache[cacheKey] = {
          minutes: best.minutes,
          text: best.text,
          mode: best.mode,
          address: listing.address,
        };
      } else {
        listing.commuteMinutes = null;
        listing.commuteText = 'Not available';
        listing.commuteMode = null;
      }

      // Small delay to respect rate limits
      if (apiCalls % 10 === 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`[Commute] Error for "${listing.address}":`, err.message);
      listing.commuteMinutes = null;
      listing.commuteText = 'Error';
      listing.commuteMode = null;
    }
  }

  saveCache(cache);
  console.log(`[Commute] ${apiCalls} API calls, ${Object.keys(cache).length} total cached`);
  return listings;
}

module.exports = { calculateCommuteTimes };
