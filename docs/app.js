(() => {
  let allListings = [];
  let groupSize = 4;
  const BUDGET_PER_PERSON = 2500;

  // DOM elements
  const grid = document.getElementById('listingsGrid');
  const loading = document.getElementById('loading');
  const resultsCount = document.getElementById('resultsCount');
  const budgetCap = document.getElementById('budgetCap');
  const lastUpdated = document.getElementById('lastUpdated');
  const groupToggle = document.getElementById('groupToggle');
  const filterPrice = document.getElementById('filterPrice');
  const filterPriceVal = document.getElementById('filterPriceVal');
  const filterCommute = document.getElementById('filterCommute');
  const filterCommuteVal = document.getElementById('filterCommuteVal');
  const filterBeds = document.getElementById('filterBeds');
  const filterNeighborhood = document.getElementById('filterNeighborhood');
  const filterAmenities = document.getElementById('filterAmenities');
  const sortBy = document.getElementById('sortBy');
  const resetFilters = document.getElementById('resetFilters');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');

  // Load data
  async function loadListings() {
    try {
      const resp = await fetch('listings.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      allListings = data.listings || [];
      if (data.lastUpdated) {
        const d = new Date(data.lastUpdated);
        lastUpdated.textContent = `Updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      render();
    } catch (err) {
      loading.textContent = 'No listings data found. Run the scraper first or check listings.json.';
      console.error('Failed to load listings:', err);
    }
  }

  // Format currency
  function fmt(n) {
    return '$' + n.toLocaleString();
  }

  // Commute mode display
  function commuteIcon(mode) {
    if (mode === 'walking') return '\u{1F6B6}';
    if (mode === 'driving') return '\u{1F697}';
    return '\u{1F687}'; // transit
  }
  function commuteLabel(mode) {
    if (mode === 'walking') return 'walk';
    if (mode === 'driving') return 'drive';
    return 'transit';
  }

  // Get current filters
  function getFilters() {
    const neighborhoods = [...filterNeighborhood.querySelectorAll('input:checked')].map(el => el.value);
    const amenities = [...filterAmenities.querySelectorAll('input:checked')].map(el => el.value);
    return {
      maxPricePerPerson: parseInt(filterPrice.value),
      maxCommute: parseInt(filterCommute.value),
      minBeds: parseInt(filterBeds.value),
      neighborhoods,
      amenities,
      sort: sortBy.value,
    };
  }

  // Filter + sort listings
  function getFilteredListings() {
    const f = getFilters();
    const maxRent = BUDGET_PER_PERSON * groupSize;

    let filtered = allListings.filter(l => {
      if (l.rent > maxRent) return false;
      const ppp = Math.round(l.rent / groupSize);
      if (ppp > f.maxPricePerPerson) return false;
      if (l.commuteMinutes != null && l.commuteMinutes > f.maxCommute) return false;
      if (l.bedrooms < f.minBeds) return false;
      if (f.neighborhoods.length > 0 && !f.neighborhoods.includes(l.region)) return false;
      if (f.amenities.length > 0) {
        for (const a of f.amenities) {
          if (!l.amenities[a]) return false;
        }
      }
      return true;
    });

    // Sort
    switch (f.sort) {
      case 'price-asc':
        filtered.sort((a, b) => a.rent - b.rent);
        break;
      case 'price-desc':
        filtered.sort((a, b) => b.rent - a.rent);
        break;
      case 'commute':
        filtered.sort((a, b) => (a.commuteMinutes || 999) - (b.commuteMinutes || 999));
        break;
      case 'newest':
        filtered.sort((a, b) => {
          const da = a.listingDate ? new Date(a.listingDate) : new Date(0);
          const db = b.listingDate ? new Date(b.listingDate) : new Date(0);
          return db - da;
        });
        break;
      case 'score':
      default:
        filtered.sort((a, b) => (b.scores?.[groupSize] || 0) - (a.scores?.[groupSize] || 0));
    }

    return filtered;
  }

  // Render cards
  function render() {
    const listings = getFilteredListings();
    resultsCount.textContent = `${listings.length} listing${listings.length !== 1 ? 's' : ''}`;
    budgetCap.textContent = fmt(BUDGET_PER_PERSON * groupSize) + '/mo';

    if (listings.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h2>No listings match your filters</h2>
          <p>Try adjusting your filters or increasing the budget.</p>
        </div>`;
      return;
    }

    grid.innerHTML = listings.map(l => {
      const score = l.scores?.[groupSize] || 0;
      const ppp = Math.round(l.rent / groupSize);
      const pricePerSqft = l.sqft ? (l.rent / l.sqft).toFixed(2) : null;
      const scoreClass = score >= 65 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';

      const amenityTags = [];
      if (l.amenities.laundryInUnit) amenityTags.push('Laundry');
      if (l.amenities.doorman) amenityTags.push('Doorman');
      if (l.amenities.gym) amenityTags.push('Gym');
      if (l.amenities.pool) amenityTags.push('Pool');
      if (l.amenities.rooftop) amenityTags.push('Rooftop');
      if (l.amenities.balcony) amenityTags.push('Balcony');
      if (l.amenities.terrace && !l.amenities.balcony) amenityTags.push('Terrace');

      const imageHtml = l.photo
        ? `<img class="card-image" src="${l.photo}" alt="${l.address}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-image-placeholder\\'>No photo</div>'">`
        : '<div class="card-image-placeholder">No photo</div>';

      return `
        <div class="listing-card">
          ${imageHtml}
          <div class="card-body">
            <div class="card-top-row">
              <div>
                <div class="card-address">${l.address}</div>
                <div class="card-neighborhood">${l.neighborhood || l.region}${l.neighborhood && l.neighborhood !== l.region ? ' · ' + l.region : ''}</div>
              </div>
              <div class="score-badge ${scoreClass}">${score}</div>
            </div>
            <div class="card-price-row">
              <div class="price-item">
                <span class="price-label">Total</span>
                <span class="price-value total">${fmt(l.rent)}</span>
              </div>
              <div class="price-item">
                <span class="price-label">Per Person</span>
                <span class="price-value">${fmt(ppp)}</span>
              </div>
              ${pricePerSqft ? `
              <div class="price-item">
                <span class="price-label">Per Sqft</span>
                <span class="price-value">$${pricePerSqft}</span>
              </div>` : ''}
            </div>
            <div class="card-details">
              <span class="detail-chip">${l.bedrooms} bed</span>
              <span class="detail-chip">${l.bathrooms} bath</span>
              ${l.sqft ? `<span class="detail-chip">${l.sqft.toLocaleString()} sqft</span>` : ''}
              ${l.commuteMinutes != null ? `<span class="detail-chip commute-chip">${commuteIcon(l.commuteMode)} ${l.commuteMinutes} min ${commuteLabel(l.commuteMode)}</span>` : ''}
            </div>
            ${amenityTags.length > 0 ? `
            <div class="card-amenities">
              ${amenityTags.map(t => `<span class="amenity-tag">${t}</span>`).join('')}
            </div>` : ''}
            <a class="card-link" href="${l.url}" target="_blank" rel="noopener">View Listing &rarr;</a>
          </div>
        </div>`;
    }).join('');
  }

  // Event listeners
  groupToggle.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    groupToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    groupSize = parseInt(e.target.dataset.size);
    render();
  });

  filterPrice.addEventListener('input', () => {
    filterPriceVal.textContent = fmt(parseInt(filterPrice.value));
    render();
  });

  filterCommute.addEventListener('input', () => {
    filterCommuteVal.textContent = filterCommute.value + ' min';
    render();
  });

  filterBeds.addEventListener('change', render);
  sortBy.addEventListener('change', render);
  filterNeighborhood.addEventListener('change', render);
  filterAmenities.addEventListener('change', render);

  resetFilters.addEventListener('click', () => {
    filterPrice.value = 2500;
    filterPriceVal.textContent = '$2,500';
    filterCommute.value = 60;
    filterCommuteVal.textContent = '60 min';
    filterBeds.value = '3';
    sortBy.value = 'score';
    filterNeighborhood.querySelectorAll('input').forEach(el => el.checked = true);
    filterAmenities.querySelectorAll('input').forEach(el => el.checked = false);
    render();
  });

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Init
  loadListings();
})();
