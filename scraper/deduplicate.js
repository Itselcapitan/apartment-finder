/**
 * Deduplicates listings from multiple sources by normalized address.
 * When duplicates are found, merges data — preferring the source with more detail.
 */

function deduplicateListings(allListings) {
  const seen = new Map();

  for (const listing of allListings) {
    const key = listing.addressNormalized + '|' + (listing.zipCode || listing.region);

    if (seen.has(key)) {
      const existing = seen.get(key);
      // Merge: prefer whichever has more data
      seen.set(key, mergeListing(existing, listing));
    } else {
      seen.set(key, listing);
    }
  }

  const deduplicated = Array.from(seen.values());
  console.log(`[Dedup] ${allListings.length} listings → ${deduplicated.length} after dedup`);
  return deduplicated;
}

function mergeListing(a, b) {
  return {
    ...a,
    source: a.source === b.source ? a.source : `${a.source}+${b.source}`,
    id: a.id,
    // Prefer non-zero/non-null values
    rent: a.rent || b.rent,
    sqft: a.sqft || b.sqft,
    photo: a.photo || b.photo,
    url: a.url || b.url,
    lat: a.lat || b.lat,
    lng: a.lng || b.lng,
    bedrooms: Math.max(a.bedrooms || 0, b.bedrooms || 0),
    bathrooms: Math.max(a.bathrooms || 0, b.bathrooms || 0),
    // Merge amenities: true if either source says true
    amenities: {
      laundryInUnit: a.amenities.laundryInUnit || b.amenities.laundryInUnit,
      doorman: a.amenities.doorman || b.amenities.doorman,
      gym: a.amenities.gym || b.amenities.gym,
      pool: a.amenities.pool || b.amenities.pool,
      rooftop: a.amenities.rooftop || b.amenities.rooftop,
      terrace: a.amenities.terrace || b.amenities.terrace,
      balcony: a.amenities.balcony || b.amenities.balcony,
    },
    // Keep both URLs for reference
    urls: {
      zillow: a.source === 'zillow' ? a.url : b.source === 'zillow' ? b.url : null,
      apartments: a.source === 'apartments.com' ? a.url : b.source === 'apartments.com' ? b.url : null,
    },
  };
}

module.exports = { deduplicateListings };
