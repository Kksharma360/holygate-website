(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const productGrid = $('#product-grid');
  const searchInput = $('#site-search');
  const filterLabel = $('#active-filter-label');
  const clearFilter = $('#clear-filter');
  const emptyState = $('#empty-state');
  const toast = $('#site-toast');
  let allProducts = [];
  let activeCategory = '';
  let activeSearch = '';
  let toastTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function categoryClass(category = '') {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function safeAmazonUrl(raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || !(url.hostname === 'amazon.in' || url.hostname.endsWith('.amazon.in'))) return 'https://www.amazon.in/';
      return url.href;
    } catch { return 'https://www.amazon.in/'; }
  }
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }
  function displayPrice(product) {
    if (product.showOfferPrice && product.offerPrice && Number.isFinite(Number(product.offerPrice))) {
      const amount = Number(product.offerPrice);
      const stamp = product.offerUpdatedAt ? new Date(Number(product.offerUpdatedAt)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'price entered by store';
      return `<span class="product-price">${escapeHtml(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount))}<small>Amazon price · as of ${escapeHtml(stamp)}</small></span>`;
    }
    if (product.showOfferPrice && product.offerPrice) {
      return `<span class="product-price">${escapeHtml(product.offerPrice)}<small>Official Brand Price</small></span>`;
    }
    return `<span class="product-price product-price-note">View on Amazon<small>Official Store</small></span>`;
  }
  function updateDisclosures() {
    // Official manufacturer store - no affiliate disclosures
  }
  function productArt(product) {
    const cls = categoryClass(product.category);
    const title = escapeHtml(product.title || 'HOLYGATE');
    let shortLabel = 'PANTRY';
    if (/atta|flour|sattu/i.test(product.category || '')) shortLabel = 'ATTA';
    else if (/sugar|khand/i.test(product.category || '')) shortLabel = 'SUGAR';
    else if (/seed/i.test(product.category || '')) shortLabel = 'SEEDS';
    else if (/grain|rice/i.test(product.category || '')) shortLabel = 'GRAINS';
    else if (/pulse|lentil|dal/i.test(product.category || '')) shortLabel = 'DAL';
    else if (/other/i.test(product.category || '')) shortLabel = 'SPECIAL';
    return `<div class="product-placeholder art-${escapeHtml(cls)}" role="img" aria-label="Illustrated ${title} pack"><div class="placeholder-top"></div><div class="placeholder-brand"><span>G</span><b>HOLYGATE</b></div><div class="placeholder-name">${escapeHtml(shortLabel)}</div><div class="placeholder-sub">EVERYDAY ESSENTIALS</div><div class="placeholder-food"></div><div class="placeholder-weight">${escapeHtml(product.packSize || 'PANTRY STAPLE')}</div></div>`;
  }
  function productCard(product) {
    const title = escapeHtml(product.title || 'HOLYGATE Product');
    const productUrl = `/product.html?id=${encodeURIComponent(product.id)}`;
    const image = String(product.image || '');
    const imageBlock = /^https:\/\//i.test(image) || image.startsWith('/assets/')
      ? `<img src="${escapeHtml(image)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">`
      : productArt(product);
    const featured = product.featured
      ? `<span class="product-badge"><span class="badge-icon">★</span><span class="badge-text">HOLYGATE PICK</span></span>`
      : '';
    const desc = product.description ? `<p class="product-description">${escapeHtml(String(product.description).replace(/\n/g, ' '))}</p>` : '';
    const size = product.packSize ? `<p class="product-pack-size">${escapeHtml(product.packSize)}</p>` : '<p class="product-pack-size">Everyday pantry essential</p>';
    const ratingScore = escapeHtml(product.rating || '4.8');
    const ratingCount = escapeHtml(product.ratingCount || '(1,240+)');
    const ratingBlock = `<div class="product-rating-row">
      <span class="product-stars">★★★★★</span>
      <span class="product-rating-score">${ratingScore}</span>
      <span class="product-rating-count">${ratingCount}</span>
    </div>`;

    return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <a class="product-card-image" href="${productUrl}" aria-label="View ${title}">${featured}${imageBlock}</a>
      <div class="product-card-info">
        <span class="product-category">${escapeHtml(product.category || 'Pantry Staples')}</span>
        <h3 class="product-title"><a href="${productUrl}">${title}</a></h3>
        ${ratingBlock}
        ${size}
        ${desc}
        <div class="product-bottom">
          ${displayPrice(product)}
          <a class="product-cta" href="${productUrl}">View Details & Buy <span>→</span></a>
        </div>
      </div>
    </article>`;
  }

  function openProductDetails(product) {
    const modal = $('#product-modal');
    const gallery = [...new Set([product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(src => /^https:\/\//i.test(String(src || '')) || String(src || '').startsWith('/assets/')))];
    const primary = gallery[0] || '';
    const mainImage = primary
      ? `<img class="modal-main-img" src="${escapeHtml(primary)}" alt="${escapeHtml(product.title)}" referrerpolicy="no-referrer">`
      : productArt(product);
    const thumbnails = gallery.length > 1 ? `<div class="modal-gallery">${gallery.map((src, index) => `<button class="modal-thumb ${index === 0 ? 'is-active' : ''}" type="button" data-gallery-src="${escapeHtml(src)}" aria-label="Show product image ${index + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div>` : '';
    const features = (Array.isArray(product.highlights) ? product.highlights : []).filter(Boolean);
    const featureBlock = features.length ? `<div class="modal-features"><h3>Product highlights</h3><ul>${features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></div>` : '';
    const description = product.description ? `<p class="modal-description">${escapeHtml(product.description).replace(/\r?\n/g, '<br>')}</p>` : '';
    const url = safeAmazonUrl(product.amazonUrl || `https://www.amazon.in/dp/${product.asin}`);
    $('#modal-media').innerHTML = `<div class="modal-main-image">${mainImage}</div>${thumbnails}`;
    $('#modal-product-copy').innerHTML = `<div class="modal-copy-top"><span class="modal-category">${escapeHtml(product.category || 'Pantry Staples')}</span>${product.asin ? `<span class="modal-asin">ASIN ${escapeHtml(product.asin)}</span>` : ''}</div><h2 id="modal-title">${escapeHtml(product.title || 'HOLYGATE Product')}</h2><div class="modal-meta-line">${product.brand ? `<span>Brand: <b>${escapeHtml(product.brand)}</b></span>` : ''}${product.packSize ? `<span>Pack size: <b>${escapeHtml(product.packSize)}</b></span>` : ''}</div>${displayPrice(product)}${description}${featureBlock}<div class="modal-actions"><a class="product-cta modal-buy" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Order on Amazon Storefront <span>↗</span></a><p>Official HOLYGATE Product · Fulfilled securely via Amazon.in with fast doorstep delivery.</p></div>`;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.product-modal-dialog').focus({ preventScroll: true });
    $('#modal-media').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true }));
  }
  function closeProductDetails() {
    const modal = $('#product-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function getFilteredProducts() {
    let products = [...allProducts];
    if (activeCategory) products = products.filter(p => p.category === activeCategory);
    if (activeSearch) {
      const query = activeSearch.toLowerCase();
      products = products.filter(p => [p.title, p.category, p.description, p.brand, p.packSize, ...(p.highlights || [])].join(' ').toLowerCase().includes(query));
    }
    const sort = $('#product-sort')?.value || 'featured';
    if (sort === 'az') products.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'za') products.sort((a, b) => b.title.localeCompare(a.title));
    else products.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title));
    return products;
  }
  function renderProducts() {
    if (!productGrid) return;
    const products = getFilteredProducts();
    productGrid.innerHTML = products.length ? products.map(productCard).join('') : '';
    emptyState.hidden = products.length > 0;
    productGrid.hidden = products.length === 0;
    clearFilter.hidden = !(activeCategory || activeSearch);
    if (activeSearch) filterLabel.textContent = `Search results for “${activeSearch}”`;
    else if (activeCategory) filterLabel.textContent = `Showing ${activeCategory}`;
    else filterLabel.textContent = 'Showing our featured picks';
    $$('img', productGrid).forEach(img => {
      img.addEventListener('error', () => {
        const product = allProducts.find(item => item.title === img.alt);
        if (!product) { img.remove(); return; }
        const holder = document.createElement('div');
        holder.innerHTML = productArt(product);
        img.replaceWith(holder.firstElementChild || document.createElement('div'));
      }, { once: true });
    });
  }
  function setCategory(category) {
    activeCategory = category || '';
    $$('.category-card').forEach(card => card.classList.toggle('is-selected', card.dataset.category === activeCategory));
    renderProducts();
    $('#bestsellers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function loadProducts() {
    if (!productGrid) return;
    try {
      const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Could not load products');
      const data = await response.json();
      allProducts = Array.isArray(data.products) ? data.products : [];
      updateDisclosures();
      renderProducts();
    } catch (error) {
      productGrid.innerHTML = '<div class="loading-card">The storefront could not connect to its product catalogue. Start the server with <code>npm start</code> and refresh this page.</div>';
    }
  }

  $('#search-form')?.addEventListener('submit', event => {
    event.preventDefault();
    activeSearch = searchInput.value.trim();
    activeCategory = '';
    $$('.category-card').forEach(card => card.classList.remove('is-selected'));
    renderProducts();
    $('#bestsellers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  searchInput?.addEventListener('input', () => {
    const next = searchInput.value.trim();
    if (!next && activeSearch) { activeSearch = ''; renderProducts(); }
  });
  $$('.category-card').forEach(card => card.addEventListener('click', () => {
    activeSearch = '';
    if (searchInput) searchInput.value = '';
    setCategory(activeCategory === card.dataset.category ? '' : card.dataset.category);
  }));
  $$('[data-nav-category]').forEach(link => link.addEventListener('click', () => {
    activeSearch = '';
    if (searchInput) searchInput.value = '';
    setCategory(link.dataset.navCategory);
  }));
  clearFilter?.addEventListener('click', () => {
    activeCategory = '';
    activeSearch = '';
    if (searchInput) searchInput.value = '';
    $$('.category-card').forEach(card => card.classList.remove('is-selected'));
    renderProducts();
  });
  $('#view-all-products')?.addEventListener('click', event => {
    event.preventDefault();
    activeCategory = '';
    activeSearch = '';
    if (searchInput) searchInput.value = '';
    $$('.category-card').forEach(card => card.classList.remove('is-selected'));
    renderProducts();
    $('#shop-range')?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#product-sort')?.addEventListener('change', renderProducts);
  productGrid?.addEventListener('click', event => {
    const button = event.target.closest('button[data-action="details"]');
    if (!button) return;
    const product = allProducts.find(item => item.id === button.dataset.id);
    if (product) openProductDetails(product);
  });
  $('#product-modal')?.addEventListener('click', event => {
    if (event.target.closest('[data-modal-close]')) { closeProductDetails(); return; }
    const thumb = event.target.closest('[data-gallery-src]');
    if (thumb) {
      const src = thumb.dataset.gallerySrc;
      const primary = $('#modal-media .modal-main-img');
      if (primary) { primary.src = src; primary.style.visibility = 'visible'; }
      $$('.modal-thumb').forEach(item => item.classList.toggle('is-active', item === thumb));
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProductDetails(); });
  $('#empty-reset')?.addEventListener('click', () => {
    activeCategory = ''; activeSearch = '';
    if (searchInput) searchInput.value = '';
    renderProducts();
  });

  // Hero Banner Slider (Automatic continuous scrolling)
  const slider = $('#hero-banner-slider');
  if (slider) {
    const slides = $$('.hero-slide', slider);
    let currentIndex = 0;
    let autoPlayTimer = null;
    let touchStartX = 0;

    function goToSlide(index) {
      if (!slides.length) return;
      currentIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === currentIndex);
      });
    }

    function nextSlide() { goToSlide(currentIndex + 1); }
    function prevSlide() { goToSlide(currentIndex - 1); }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayTimer = setInterval(nextSlide, 4000);
    }
    function stopAutoPlay() {
      if (autoPlayTimer) { clearInterval(autoPlayTimer); autoPlayTimer = null; }
    }

    // Touch swipe support for mobile devices
    slider.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', e => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 40) {
        if (diff < 0) nextSlide(); else prevSlide();
        startAutoPlay();
      }
    }, { passive: true });

    // Pause only when tab is hidden in background, resume when active
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoPlay();
      else startAutoPlay();
    });

    startAutoPlay();
  }

  // Mobile navigation drawer toggle
  const navHamburgerSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>';
  const navCloseSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  const mobileMenuBtn = $('#mobile-menu');
  const mainNavEl = $('#main-nav');
  if (mobileMenuBtn && mainNavEl) {
    mobileMenuBtn.addEventListener('click', () => {
      const open = mainNavEl.classList.toggle('open');
      mobileMenuBtn.setAttribute('aria-expanded', String(open));
      mobileMenuBtn.innerHTML = open ? navCloseSvg : navHamburgerSvg;
      document.body.classList.toggle('nav-mobile-open', open);
    });

    mainNavEl.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNavEl.classList.remove('open');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileMenuBtn.innerHTML = navHamburgerSvg;
        document.body.classList.remove('nav-mobile-open');
      });
    });
  }

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  loadProducts();
})();

