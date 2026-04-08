/**
 * Determines neighborhood from lat/lng for Manhattan, Hoboken, and Jersey City.
 * Uses simplified latitude bands — not perfect but good enough for sorting/display.
 */

// Manhattan neighborhoods by latitude band (south to north)
const MANHATTAN_NEIGHBORHOODS = [
  { name: 'Financial District', minLat: 40.700, maxLat: 40.711 },
  { name: 'Tribeca', minLat: 40.711, maxLat: 40.720 },
  { name: 'Chinatown', minLat: 40.714, maxLat: 40.720, minLng: -73.998, maxLng: -73.990 },
  { name: 'Lower East Side', minLat: 40.714, maxLat: 40.724, minLng: -73.993, maxLng: -73.975 },
  { name: 'SoHo', minLat: 40.720, maxLat: 40.728, minLng: -74.005, maxLng: -73.995 },
  { name: 'East Village', minLat: 40.724, maxLat: 40.733, minLng: -73.993, maxLng: -73.975 },
  { name: 'West Village', minLat: 40.728, maxLat: 40.738, minLng: -74.010, maxLng: -73.998 },
  { name: 'Greenwich Village', minLat: 40.728, maxLat: 40.738, minLng: -73.998, maxLng: -73.990 },
  { name: 'Gramercy', minLat: 40.733, maxLat: 40.742, minLng: -73.990, maxLng: -73.975 },
  { name: 'Chelsea', minLat: 40.738, maxLat: 40.750, minLng: -74.005, maxLng: -73.990 },
  { name: 'Midtown South', minLat: 40.742, maxLat: 40.750, minLng: -73.990, maxLng: -73.975 },
  { name: 'Midtown', minLat: 40.750, maxLat: 40.762 },
  { name: "Hell's Kitchen", minLat: 40.757, maxLat: 40.770, minLng: -73.998, maxLng: -73.982 },
  { name: 'Upper East Side', minLat: 40.762, maxLat: 40.785, minLng: -73.975, maxLng: -73.950 },
  { name: 'Upper West Side', minLat: 40.770, maxLat: 40.800, minLng: -73.990, maxLng: -73.975 },
  { name: 'Harlem', minLat: 40.800, maxLat: 40.820 },
  { name: 'East Harlem', minLat: 40.790, maxLat: 40.810, minLng: -73.950, maxLng: -73.930 },
  { name: 'Washington Heights', minLat: 40.835, maxLat: 40.860 },
  { name: 'Inwood', minLat: 40.860, maxLat: 40.880 },
];

// Jersey City neighborhoods by latitude/longitude zones
const JC_NEIGHBORHOODS = [
  { name: 'Downtown JC', minLat: 40.714, maxLat: 40.728, minLng: -74.045, maxLng: -74.025 },
  { name: 'Exchange Place', minLat: 40.710, maxLat: 40.718, minLng: -74.040, maxLng: -74.028 },
  { name: 'Newport', minLat: 40.725, maxLat: 40.733, minLng: -74.040, maxLng: -74.025 },
  { name: 'Journal Square', minLat: 40.730, maxLat: 40.740, minLng: -74.070, maxLng: -74.055 },
  { name: 'The Heights', minLat: 40.740, maxLat: 40.755, minLng: -74.065, maxLng: -74.040 },
  { name: 'Greenville', minLat: 40.695, maxLat: 40.715, minLng: -74.085, maxLng: -74.055 },
  { name: 'Bergen-Lafayette', minLat: 40.700, maxLat: 40.720, minLng: -74.075, maxLng: -74.050 },
  { name: 'JSQ / McGinley Square', minLat: 40.720, maxLat: 40.735, minLng: -74.065, maxLng: -74.045 },
];

// Hoboken neighborhoods
const HOBOKEN_NEIGHBORHOODS = [
  { name: 'Downtown Hoboken', minLat: 40.735, maxLat: 40.742, minLng: -74.035, maxLng: -74.025 },
  { name: 'Midtown Hoboken', minLat: 40.742, maxLat: 40.748, minLng: -74.035, maxLng: -74.025 },
  { name: 'Uptown Hoboken', minLat: 40.748, maxLat: 40.755, minLng: -74.035, maxLng: -74.025 },
];

function findNeighborhood(lat, lng, zones) {
  for (const z of zones) {
    if (lat >= z.minLat && lat < z.maxLat) {
      if (z.minLng !== undefined && z.maxLng !== undefined) {
        if (lng >= z.minLng && lng < z.maxLng) return z.name;
      } else {
        return z.name;
      }
    }
  }
  return null;
}

function getNeighborhood(lat, lng, region) {
  if (!lat || !lng) return '';

  if (region === 'Manhattan') {
    return findNeighborhood(lat, lng, MANHATTAN_NEIGHBORHOODS) || 'Manhattan';
  }
  if (region === 'Jersey City') {
    return findNeighborhood(lat, lng, JC_NEIGHBORHOODS) || 'Jersey City';
  }
  if (region === 'Hoboken') {
    return findNeighborhood(lat, lng, HOBOKEN_NEIGHBORHOODS) || 'Hoboken';
  }
  return region || '';
}

function assignNeighborhoods(listings) {
  for (const listing of listings) {
    const neighborhood = getNeighborhood(listing.lat, listing.lng, listing.region);
    if (neighborhood) {
      listing.neighborhood = neighborhood;
    }
  }
  console.log(`[Neighborhoods] Assigned neighborhoods to ${listings.length} listings`);
  return listings;
}

module.exports = { assignNeighborhoods, getNeighborhood };
