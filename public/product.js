(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function safeAmazonUrl(raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || !(url.hostname === 'amazon.in' || url.hostname.endsWith('.amazon.in'))) {
        return 'https://www.amazon.in/';
      }
      return url.href;
    } catch {
      return 'https://www.amazon.in/';
    }
  }

  function categoryClass(category = '') {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function productArt(product) {
    const cls = categoryClass(product.category);
    const title = escapeHtml(product.title || 'HOLYGATE');
    let shortLabel = 'PANTRY';
    if (/atta|flour/i.test(product.category || '')) shortLabel = 'ATTA';
    else if (/sugar/i.test(product.category || '')) shortLabel = 'SUGAR';
    else if (/seed/i.test(product.category || '')) shortLabel = 'SEEDS';
    else if (/grain/i.test(product.category || '')) shortLabel = 'GRAINS';
    else if (/pulse|lentil/i.test(product.category || '')) shortLabel = 'DAL';
    return `<div class="product-placeholder art-${escapeHtml(cls)}" role="img" aria-label="Illustrated ${title} pack"><div class="placeholder-top"></div><div class="placeholder-brand"><span>G</span><b>HOLYGATE</b></div><div class="placeholder-name">${escapeHtml(shortLabel)}</div><div class="placeholder-sub">EVERYDAY ESSENTIALS</div><div class="placeholder-food"></div><div class="placeholder-weight">${escapeHtml(product.packSize || 'PANTRY STAPLE')}</div></div>`;
  }

  function productCard(product) {
    const title = escapeHtml(product.title || 'HOLYGATE Product');
    const productUrl = `./product.html?id=${encodeURIComponent(product.id)}`;
    const image = String(product.image || '');
    const imageBlock = /^https:\/\//i.test(image) || image.startsWith('assets/') || image.startsWith('./assets/') || image.startsWith('/assets/')
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
    
    let priceSnippet = '<span class="product-price product-price-note">Check current price<small>On Amazon</small></span>';
    if (product.offerPrice) {
      priceSnippet = `<span class="product-price">₹${escapeHtml(product.offerPrice)}<small>Amazon price</small></span>`;
    }

    return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <a class="product-card-image" href="${productUrl}" aria-label="View ${title}">${featured}${imageBlock}</a>
      <div class="product-card-info">
        <span class="product-category">${escapeHtml(product.category || 'Pantry Staples')}</span>
        <h3 class="product-title"><a href="${productUrl}">${title}</a></h3>
        ${ratingBlock}
        ${size}
        ${desc}
        <div class="product-bottom">
          ${priceSnippet}
          <a class="product-cta" href="${productUrl}">View Details & Buy <span>→</span></a>
        </div>
      </div>
    </article>`;
  }

  // Setup Mobile Nav and search
  const navHamburgerSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>';
  const navCloseSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  const mobileMenuBtn = $('#mobile-menu');
  const mainNav = $('#main-nav');
  if (mobileMenuBtn && mainNav) {
    mobileMenuBtn.addEventListener('click', () => {
      const open = mainNav.classList.toggle('open');
      mobileMenuBtn.setAttribute('aria-expanded', String(open));
      mobileMenuBtn.innerHTML = open ? navCloseSvg : navHamburgerSvg;
    });
    $$('.main-nav a').forEach(link => link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
      mobileMenuBtn.innerHTML = navHamburgerSvg;
    }));
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('id') || params.get('asin');

    const loadingEl = $('#pdp-loading');
    const contentEl = $('#pdp-content');
    const extendedEl = $('#pdp-extended-section');
    const relatedEl = $('#pdp-related-section');

    if (!targetId) {
      loadingEl.innerHTML = `<div style="text-align: center;">
        <h2 style="font-size: 20px; margin-bottom: 12px; color: var(--clr-forest);">Product Not Specified</h2>
        <p style="color: var(--clr-subtext); margin-bottom: 20px;">Please select a product from our catalog.</p>
        <a href="/" class="btn-amazon-primary" style="display: inline-flex; width: auto; padding: 10px 24px;">Browse Storefront ↗</a>
      </div>`;
      return;
    }

    let product = null;
    let allProducts = [];

    if (window.HolygateDB) {
      try {
        product = await window.HolygateDB.getProductById(targetId);
        allProducts = await window.HolygateDB.getProducts();
      } catch (e) {
        console.warn('HolygateDB product fetch error:', e);
      }
    }

    if (!product) {
      try {
        // First attempt single product endpoint
        const directRes = await fetch(`/api/products/${encodeURIComponent(targetId)}`);
        if (directRes.ok) {
          const data = await directRes.json();
          product = data.product;
        }
      } catch (e) {
        console.warn('Direct fetch failed, falling back to catalogue list:', e);
      }
    }

    if (!allProducts.length) {
      try {
        // Fetch full catalogue for fallback lookup and related products
        const listRes = await fetch('/api/products');
        if (listRes.ok) {
          const data = await listRes.json();
          allProducts = Array.isArray(data.products) ? data.products : [];
          if (!product) {
            product = allProducts.find(p => p.id === targetId || p.asin === targetId);
          }
        }
      } catch (e) {
        console.warn('Catalogue list fetch error:', e);
      }
    }

    if (!product || !allProducts.length) {
      try {
        const jsonRes = await fetch('./data/products.json');
        if (jsonRes.ok) {
          const data = await jsonRes.json();
          allProducts = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
          if (!product) {
            product = allProducts.find(p => p.id === targetId || p.asin === targetId);
          }
        }
      } catch (err) {
        console.warn('Local json fallback fetch failed:', err);
      }
    }

    if (!product) {
      loadingEl.innerHTML = `<div style="text-align: center;">
        <h2 style="font-size: 20px; margin-bottom: 12px; color: #b91c1c;">Product Not Found</h2>
        <p style="color: var(--clr-subtext); margin-bottom: 20px;">The requested product could not be located in our catalogue.</p>
        <a href="./" class="btn-amazon-primary" style="display: inline-flex; width: auto; padding: 10px 24px;">Return to Storefront ↗</a>
      </div>`;
      return;
    }

    // Populate Page Meta & Breadcrumbs
    document.title = `${product.title} — HOLYGATE`;
    const crumbCategory = $('#crumb-category');
    if (crumbCategory) {
      crumbCategory.textContent = product.category || 'Store';
      crumbCategory.href = `./#shop-range`;
    }
    const crumbTitle = $('#crumb-title');
    if (crumbTitle) {
      crumbTitle.textContent = product.title;
    }

    // Gather unique, valid image sources
    const rawImages = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])];
    const gallery = [...new Set(rawImages.filter(src => /^https?:\/\//i.test(String(src || '')) || String(src || '').includes('assets/')))];
    const primaryImg = gallery[0] || product.image || './assets/brand-logo.png';

    // Setup Gallery & Main Image
    const mainImgEl = $('#pdp-main-img');
    if (mainImgEl) {
      mainImgEl.src = primaryImg;
      mainImgEl.alt = product.title;
      mainImgEl.addEventListener('error', () => {
        mainImgEl.src = './assets/brand-logo.png';
      }, { once: true });
    }

    const thumbsRail = $('#pdp-thumbs-rail');
    if (thumbsRail) {
      if (gallery.length > 1) {
        thumbsRail.innerHTML = gallery.map((src, index) => `
          <button class="pdp-thumb-btn ${index === 0 ? 'active' : ''}" type="button" data-src="${escapeHtml(src)}" aria-label="Product thumbnail ${index + 1}">
            <img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer">
          </button>
        `).join('');

        thumbsRail.addEventListener('click', event => {
          const btn = event.target.closest('.pdp-thumb-btn');
          if (!btn) return;
          const targetSrc = btn.dataset.src;
          if (mainImgEl && targetSrc) {
            mainImgEl.src = targetSrc;
          }
          $$('.pdp-thumb-btn', thumbsRail).forEach(b => b.classList.toggle('active', b === btn));
        });
      } else {
        thumbsRail.innerHTML = '';
      }
    }

    // Product Info details
    $('#pdp-category').textContent = product.category || 'Pantry Staples';
    $('#pdp-title').textContent = product.title || 'Product';
    $('#pdp-brand').textContent = product.brand || 'HOLYGATE';

    // Pricing
    const priceText = product.offerPrice ? `${product.offerPrice}` : 'Check on Amazon';
    $('#pdp-price').textContent = priceText;
    $('#pdp-buybox-price').textContent = product.offerPrice ? `₹${product.offerPrice}` : 'Check Live Price';

    // Specs
    $('#pdp-pack-size').textContent = product.packSize || 'Standard Pack';
    $('#pdp-spec-cat').textContent = product.category || 'Pantry Staples';
    $('#pdp-asin').textContent = product.asin || 'N/A';

    // Highlights (About this item)
    const highlights = (Array.isArray(product.highlights) ? product.highlights : []).filter(Boolean);
    const highlightsBox = $('#pdp-highlights-box');
    const highlightsList = $('#pdp-highlights-list');
    if (highlights.length > 0 && highlightsList) {
      highlightsList.innerHTML = highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('');
      highlightsBox.hidden = false;
    } else if (product.description && highlightsList) {
      // Fallback: split description lines into bullets
      const lines = product.description.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 10);
      if (lines.length > 1) {
        highlightsList.innerHTML = lines.slice(0, 5).map(l => `<li>${escapeHtml(l)}</li>`).join('');
        highlightsBox.hidden = false;
      } else {
        highlightsBox.hidden = true;
      }
    } else if (highlightsBox) {
      highlightsBox.hidden = true;
    }

    // Buy Box Links (Amazon Redirect)
    const amazonLink = safeAmazonUrl(product.amazonUrl || `https://www.amazon.in/dp/${product.asin}`);
    const btnBuy = $('#btn-buy-amazon');
    if (btnBuy) {
      btnBuy.href = amazonLink;
    }
    const btnCheck = $('#btn-check-amazon');
    if (btnCheck) {
      btnCheck.href = amazonLink;
    }

    // Extended Section: Description & Specs Table
    const descEl = $('#pdp-full-desc');
    if (descEl) {
      const fullDesc = product.description || 'Pure, high-grade produce directly sourced and hygienically packed for maximum nutrition and freshness.';
      descEl.innerHTML = escapeHtml(fullDesc).replace(/\r?\n\r?\n/g, '<br><br>').replace(/\r?\n/g, '<br>');
    }

    $('#tbl-brand').textContent = product.brand || 'HOLYGATE';
    $('#tbl-category').textContent = product.category || 'Food Staples';
    $('#tbl-pack-size').textContent = product.packSize || 'Standard';
    $('#tbl-asin').textContent = product.asin || 'N/A';

    // Show Main Content and Extended Section
    loadingEl.hidden = true;
    contentEl.hidden = false;
    extendedEl.hidden = false;

    // Related Products Section
    if (allProducts.length > 1 && relatedEl) {
      const related = allProducts.filter(p => p.id !== product.id && (p.category === product.category || !product.category)).slice(0, 4);
      const fallbackRelated = related.length ? related : allProducts.filter(p => p.id !== product.id).slice(0, 4);

      if (fallbackRelated.length > 0) {
        const relatedGrid = $('#pdp-related-grid');
        if (relatedGrid) {
          relatedGrid.innerHTML = fallbackRelated.map(productCard).join('');
          relatedEl.hidden = false;
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
