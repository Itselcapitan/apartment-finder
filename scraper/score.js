/**
 * Scoring engine — composite 0–100 score per listing.
 *
 * Continuous factors are min-max normalized across all listings.
 * Binary factors are full weight if present, 0 if not.
 * Scores are computed for each group size since price-per-person changes.
 */

// Nightlife cluster centers (lat/lng)
const NIGHTLIFE_CLUSTERS = [
  { name: "Hell's Kitchen", lat: 40.7638, lng: -73.9918 },
  { name: 'Lower East Side', lat: 40.7150, lng: -73.9843 },
  { name: 'East Village', lat: 40.7265, lng: -73.9815 },
];
const NIGHTLIFE_RADIUS_MILES = 1.0;

// Geography priority
const GEO_SCORES = {
  Manhattan: 1.0,
  Hoboken: 0.7,
  'Jersey City': 0.5,
};

const WEIGHTS = {
  pricePerPerson: 0.25,
  pricePerSqft: 0.15,
  pricePerBedroom: 0.15,
  commute: 0.15,
  doorman: 0.08,
  amenities: 0.07, // 1.75% each for gym/pool/rooftop/terrace
  outdoor: 0.05,
  nightlife: 0.05,
  geography: 0.05,
};

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isNearNightlife(lat, lng) {
  if (!lat || !lng) return false;
  return NIGHTLIFE_CLUSTERS.some(
    c => haversineDistance(lat, lng, c.lat, c.lng) <= NIGHTLIFE_RADIUS_MILES
  );
}

// Min-max normalize: lower = better → invert so higher normalized = better
function normalizeInverse(values) {
  const valid = values.filter(v => v != null && v > 0);
  if (valid.length === 0) return values.map(() => 0.5);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return values.map(v => v != null ? 1 : 0);
  return values.map(v => {
    if (v == null || v <= 0) return 0;
    return 1 - (v - min) / (max - min);
  });
}

function scoreListings(listings, groupSizes = [3, 4, 5, 6]) {
  // Pre-compute static factors
  const sqftValues = listings.map(l => l.sqft && l.rent ? l.rent / l.sqft : null);
  const bedroomValues = listings.map(l => l.bedrooms ? l.rent / l.bedrooms : null);
  const commuteValues = listings.map(l => l.commuteMinutes);

  const sqftNorm = normalizeInverse(sqftValues);
  const bedroomNorm = normalizeInverse(bedroomValues);
  const commuteNorm = normalizeInverse(commuteValues);

  for (const groupSize of groupSizes) {
    // Price per person changes with group size
    const pppValues = listings.map(l => l.rent / groupSize);
    const pppNorm = normalizeInverse(pppValues);

    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      let score = 0;

      // Continuous factors
      score += pppNorm[i] * WEIGHTS.pricePerPerson;
      score += sqftNorm[i] * WEIGHTS.pricePerSqft;
      score += bedroomNorm[i] * WEIGHTS.pricePerBedroom;
      score += commuteNorm[i] * WEIGHTS.commute;

      // Binary factors
      if (l.amenities.doorman) score += WEIGHTS.doorman;

      // Amenity bonuses (gym, pool, rooftop, terrace)
      const amenityCount = [l.amenities.gym, l.amenities.pool, l.amenities.rooftop, l.amenities.terrace]
        .filter(Boolean).length;
      score += (amenityCount / 4) * WEIGHTS.amenities;

      // Outdoor space
      if (l.amenities.balcony || l.amenities.terrace) score += WEIGHTS.outdoor;

      // Nightlife proximity
      if (isNearNightlife(l.lat, l.lng)) score += WEIGHTS.nightlife;

      // Geography
      const geoMultiplier = GEO_SCORES[l.region] || 0.5;
      score += geoMultiplier * WEIGHTS.geography;

      // Scale to 0-100
      const finalScore = Math.round(score * 100);

      if (!l.scores) l.scores = {};
      l.scores[groupSize] = finalScore;
      l[`pricePerPerson_${groupSize}`] = Math.round(l.rent / groupSize);
    }
  }

  return listings;
}

module.exports = { scoreListings };
