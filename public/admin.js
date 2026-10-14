(() => {
  const $ = selector => document.querySelector(selector);
  const loginView = $('#login-view');
  const dashboardView = $('#dashboard-view');
  const loginForm = $('#login-form');
  const productForm = $('#product-form');
  const toast = $('#admin-toast');
  let products = [];
  let toastTimer;
  let editMeta = {};

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setImportStatus(message = '', kind = '') {
    const element = $('#import-status');
    element.textContent = message;
    element.className = `inline-status ${kind}`.trim();
  }

  function setSaveStatus(message = '') {
    $('#save-status').textContent = message;
  }

  function setLoginError(message = '') {
    const element = $('#login-error');
    if (element) element.textContent = message;
  }

  function showDashboard(username) {
    loginView.hidden = true;
    loginView.style.display = 'none';
    dashboardView.hidden = false;
    dashboardView.style.display = 'block';

    const userDisplay = $('#admin-user-display');
    if (userDisplay) userDisplay.textContent = username || 'admin@holygate.in';
    const navLogout = $('#nav-logout-btn');
    if (navLogout) navLogout.style.display = 'inline-flex';

    window.scrollTo({ top: 0, behavior: 'instant' });
    loadProducts();
    checkSupabaseStatus();
  }

  function showLogin() {
    dashboardView.hidden = true;
    dashboardView.style.display = 'none';
    loginView.hidden = false;
    loginView.style.display = 'grid';

    const userDisplay = $('#admin-user-display');
    if (userDisplay) userDisplay.textContent = 'Admin Sign In';
    const navLogout = $('#nav-logout-btn');
    if (navLogout) navLogout.style.display = 'none';
  }

  async function logout() {
    if (window.HolygateDB) {
      await window.HolygateDB.logout();
    } else {
      try {
        await api('/api/admin/logout', { method: 'POST', body: '{}' });
      } catch (_) {}
    }
    showLogin();
    resetForm();
    showToast('You have signed out successfully.');
  }

  async function checkSupabaseStatus() {
    const badge = $('#supabase-status-badge');
    const statusText = $('#supabase-status-text');
    const engineTitle = $('#supabase-engine-title');
    const engineDesc = $('#supabase-engine-desc');
    if (!badge) return;

    if (window.HolygateDB) {
      const st = await window.HolygateDB.testConnection();
      if (st.connected) {
        badge.className = 'supabase-badge connected';
        statusText.textContent = 'Supabase Cloud Connected';
        engineTitle.textContent = `Storage Engine: Supabase Cloud (${st.mode || 'PostgreSQL'})`;
        engineDesc.textContent = `Connected to ${st.url}. Products & edits sync live with cloud database.`;
        return;
      } else if (st.configured && !st.connected) {
        badge.className = 'supabase-badge fallback';
        statusText.textContent = 'Supabase Error';
        engineTitle.textContent = 'Supabase Connection Error';
        engineDesc.textContent = st.error || 'Check project URL and API key.';
        return;
      }
    }

    try {
      const data = await api('/api/admin/supabase-status');
      if (data.configured && data.connected) {
        badge.className = 'supabase-badge connected';
        statusText.textContent = 'Supabase Cloud Connected';
        engineTitle.textContent = 'Storage Engine: Supabase Cloud PostgreSQL';
        engineDesc.textContent = `Connected to ${data.url}. Products & images stream from cloud database.`;
      } else if (data.configured && !data.connected) {
        badge.className = 'supabase-badge fallback';
        statusText.textContent = 'Supabase Error';
        engineTitle.textContent = 'Supabase Connection Error';
        engineDesc.textContent = data.error || 'Check project URL and API key in .env';
      } else {
        badge.className = 'supabase-badge fallback';
        statusText.textContent = 'Local Storage Mode';
        engineTitle.textContent = 'Storage Engine: Local products.json';
        engineDesc.textContent = 'Configure SUPABASE_URL & SUPABASE_KEY in .env to connect to your free Supabase cloud.';
      }
    } catch (_) {
      badge.className = 'supabase-badge fallback';
      statusText.textContent = 'Storage Status Unknown';
    }
  }

  $('#btn-sync-supabase')?.addEventListener('click', async () => {
    const btn = $('#btn-sync-supabase');
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<span>⏳ Syncing to Supabase…</span>';
    try {
      if (window.HolygateDB) {
        const res = await window.HolygateDB.syncLocalToSupabase();
        showToast(`✓ Synced ${res.synced} of ${res.total} products to Supabase!`);
      } else {
        const res = await api('/api/admin/supabase-sync', { method: 'POST' });
        showToast(`✓ Synced ${res.synced} of ${res.total} products to Supabase!`);
      }
      await loadProducts();
      await checkSupabaseStatus();
    } catch (e) {
      showToast(`Sync error: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  });

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function renderProducts() {
    const search = ($('#catalogue-search')?.value || '').trim().toLowerCase();
    const status = $('#catalogue-status')?.value || 'all';
    const activeEditId = $('#product-id')?.value || '';

    const filtered = products.filter(product => {
      const matchesText = [product.title, product.category, product.brand, product.asin].join(' ').toLowerCase().includes(search);
      const matchesStatus = status === 'all'
        || (status === 'published' && product.published !== false)
        || (status === 'draft' && product.published === false)
        || (status === 'amazon' && Boolean(product.amazonUrl))
        || (status === 'featured' && Boolean(product.featured));
      return matchesText && matchesStatus;
    });

    if ($('#stat-total')) $('#stat-total').textContent = String(products.length);
    if ($('#stat-live')) $('#stat-live').textContent = String(products.filter(p => p.published !== false).length);
    if ($('#stat-amazon')) $('#stat-amazon').textContent = String(products.filter(p => p.amazonUrl).length);
    if ($('#stat-featured')) $('#stat-featured').textContent = String(products.filter(p => p.featured).length);

    if ($('#catalogue-count')) {
      $('#catalogue-count').textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
    }

    if (!filtered.length) {
      $('#catalogue-list').innerHTML = '<div class="catalogue-empty">No matching products found. Try a different filter or add a product on the left.</div>';
      return;
    }

    $('#catalogue-list').innerHTML = filtered.map(product => {
      const isCurrentlyEditing = activeEditId && activeEditId === product.id ? 'is-editing' : '';
      const image = /^https:\/\//i.test(product.image || '') || String(product.image || '').startsWith('/assets/')
        ? `<img src="${esc(product.image)}" alt="" loading="lazy">` : '<div class="thumb-art"></div>';
      const state = product.published !== false ? '<span class="catalogue-pill">Published</span>' : '<span class="catalogue-pill draft">Draft</span>';
      const source = product.amazonSource ? '<span class="catalogue-pill">Amazon API</span>' : (product.amazonUrl ? '<span class="catalogue-pill">Amazon link</span>' : '<span class="catalogue-pill not-amazon">No link</span>');
      const featuredBadge = product.featured ? '<span class="catalogue-pill featured-badge">★ Featured Pick</span>' : '';
      const ratingInfo = product.rating ? `<span style="color:#d97706;font-weight:700;">★ ${esc(product.rating)}</span>` : '';
      const meta = `${esc(product.category || 'Pantry Staples')}${product.packSize ? ` · ${esc(product.packSize)}` : ''}${product.asin ? ` · ASIN ${esc(product.asin)}` : ''}`;
      const pricePill = product.offerPrice
        ? `<span class="catalogue-pill price-pill" title="Amazon price as of ${product.offerUpdatedAt ? new Date(Number(product.offerUpdatedAt)).toLocaleDateString('en-IN') : 'now'}">₹${esc(product.offerPrice)}</span>`
        : `<span class="catalogue-pill no-price-pill">No price</span>`;

      return `
        <article class="catalogue-row ${isCurrentlyEditing}" data-id="${esc(product.id)}">
          <div class="catalogue-thumb">${image}</div>
          <div class="catalogue-product-copy">
            <h3>${esc(product.title)}</h3>
            <div class="catalogue-meta">
              <span>${meta}</span>
              ${pricePill}
              ${ratingInfo}
              ${state}
              ${source}
              ${featuredBadge}
            </div>
          </div>
          <div class="catalogue-actions">
            <a href="/product.html?id=${encodeURIComponent(product.id)}" target="_blank" class="row-action view-btn" title="View customer page on storefront">View ↗</a>
            <button type="button" class="row-action toggle-feat ${product.featured ? 'is-featured' : ''}" data-action="toggle-featured" data-id="${esc(product.id)}" title="${product.featured ? 'Remove from Homepage Featured' : 'Feature on Homepage'}">
              ${product.featured ? '★ Starred' : '☆ Feature'}
            </button>
            <button type="button" class="row-action" data-action="edit" data-id="${esc(product.id)}">Edit</button>
            <button type="button" class="row-action delete" data-action="delete" data-id="${esc(product.id)}">Delete</button>
          </div>
        </article>`;
    }).join('');

    $('#catalogue-list').querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb-art' }));
      }, { once: true });
    });
  }

  async function loadProducts() {
    try {
      if (window.HolygateDB) {
        products = await window.HolygateDB.getProducts();
      } else {
        const data = await api('/api/admin/products');
        products = Array.isArray(data.products) ? data.products : [];
      }
      renderProducts();
    } catch (error) {
      try {
        const fallbackRes = await fetch('./data/products.json');
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          products = Array.isArray(fbData.products) ? fbData.products : (Array.isArray(fbData) ? fbData : []);
          renderProducts();
          return;
        }
      } catch (_) {}
      if (/sign in|session/i.test(error.message)) showLogin();
      $('#catalogue-list').innerHTML = `<div class="catalogue-empty">${esc(error.message)}</div>`;
    }
  }

  function updateImagePreview(url) {
    const preview = $('#image-preview');
    preview.innerHTML = '';
    if (!url) { preview.innerHTML = '<span>Image preview</span>'; return; }
    const image = document.createElement('img');
    image.alt = 'Product preview';
    image.src = url;
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => { preview.innerHTML = '<span>Could not load image</span>'; };
    preview.appendChild(image);
  }

  function renderGalleryThumbs(urls = []) {
    const container = $('#gallery-thumbs');
    if (!container) return;
    container.innerHTML = '';
    const valid = urls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));
    if (!valid.length) return;
    valid.forEach(u => {
      const thumb = document.createElement('div');
      thumb.className = `gallery-thumb-item ${$('#product-image').value === u ? 'is-primary' : ''}`;
      thumb.title = 'Click to make this the primary product image';
      thumb.innerHTML = `<img src="${esc(u)}" alt="Thumbnail" loading="lazy">`;
      thumb.addEventListener('click', () => {
        $('#product-image').value = u;
        updateImagePreview(u);
        container.querySelectorAll('.gallery-thumb-item').forEach(el => el.classList.remove('is-primary'));
        thumb.classList.add('is-primary');
      });
      container.appendChild(thumb);
    });
  }

  function resetForm() {
    productForm.reset();
    $('#product-id').value = '';
    $('#amazon-source').value = 'false';
    $('#asin').value = '';
    $('#amazon-url').value = '';
    $('#product-published').checked = true;
    $('#product-featured').checked = false;
    $('#product-show-price').checked = false;
    if ($('#product-rating')) $('#product-rating').value = '';
    if ($('#product-rating-count')) $('#product-rating-count').value = '';
    $('#editor-title').textContent = 'Add a product';
    $('#save-button').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Publish Listing to Website <span>↗</span>';
    editMeta = {};
    updateImagePreview('');
    renderGalleryThumbs([]);
    setImportStatus('');
    setSaveStatus('');
    renderProducts();
  }

  function fillForm(product) {
    $('#product-id').value = product.id || '';
    $('#amazon-source').value = String(Boolean(product.amazonSource));
    $('#asin').value = product.asin || '';
    $('#amazon-url').value = product.amazonUrl || '';
    $('#product-title').value = product.title || '';
    $('#product-category').value = product.category || 'Pulses & Lentils';
    if ($('#import-category')) $('#import-category').value = product.category || 'Pulses & Lentils';
    $('#product-brand').value = product.brand || '';
    $('#product-pack-size').value = product.packSize || '';
    $('#product-price').value = product.offerPrice || '';
    if ($('#product-rating')) $('#product-rating').value = product.rating || '4.8';
    if ($('#product-rating-count')) $('#product-rating-count').value = product.ratingCount || '1,240+';
    $('#product-image').value = product.image || '';
    $('#product-gallery').value = Array.isArray(product.gallery) ? product.gallery.join('\n') : '';
    $('#product-description').value = product.description || (Array.isArray(product.highlights) ? product.highlights.join('\n') : '');
    $('#product-featured').checked = Boolean(product.featured);
    $('#product-published').checked = product.published !== false;
    $('#product-show-price').checked = Boolean(product.showOfferPrice);
    $('#editor-title').textContent = 'Edit product';
    $('#save-button').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Update Listing on Website <span>↗</span>';
    editMeta = { sourceUpdatedAt: product.sourceUpdatedAt || 0, offerUpdatedAt: product.offerUpdatedAt || 0, amazonSource: Boolean(product.amazonSource) };
    updateImagePreview(product.image || '');
    renderGalleryThumbs(product.gallery || []);
    setSaveStatus('Editing selected listing.');
    renderProducts();
    $('#editor-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function productPayload() {
    const description = $('#product-description').value.trim();
    const galleries = $('#product-gallery').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return {
      id: $('#product-id').value || undefined,
      title: $('#product-title').value.trim(),
      category: $('#product-category').value,
      brand: $('#product-brand').value.trim(),
      packSize: $('#product-pack-size').value.trim(),
      offerPrice: $('#product-price').value.trim(),
      rating: ($('#product-rating')?.value.trim()) || '4.8',
      ratingCount: ($('#product-rating-count')?.value.trim()) || '1,240+',
      image: $('#product-image').value.trim(),
      gallery: galleries,
      description,
      highlights: description.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      amazonUrl: $('#amazon-url').value.trim(),
      asin: $('#asin').value.trim(),
      featured: $('#product-featured').checked,
      published: $('#product-published').checked,
      showOfferPrice: $('#product-show-price').checked,
      amazonSource: editMeta.amazonSource ?? $('#amazon-source').value === 'true',
      sourceUpdatedAt: editMeta.sourceUpdatedAt || 0,
      offerUpdatedAt: editMeta.offerUpdatedAt || 0
    };
  }

  // Auto-fill demo credentials
  $('#demo-creds-btn')?.addEventListener('click', () => {
    $('#login-username').value = 'admin@holygate.in';
    $('#login-password').value = 'HolyGateDemo#2026';
    setLoginError('');
    showToast('Demo credentials filled! Click Sign In ↗');
    loginForm.querySelector('button[type="submit"]')?.focus();
  });

  // Password visibility toggle
  $('#toggle-pw-btn')?.addEventListener('click', () => {
    const pw = $('#login-password');
    const isPw = pw.type === 'password';
    pw.type = isPw ? 'text' : 'password';
    const icon = $('#eye-icon');
    if (icon) {
      icon.innerHTML = isPw
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
  });

  // Sample Amazon links buttons
  document.querySelectorAll('.sample-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      const cat = btn.dataset.cat;
      if (url) $('#amazon-url').value = url;
      if (cat) {
        $('#import-category').value = cat;
        $('#product-category').value = cat;
      }
      showToast(`Loaded sample link: ${btn.textContent}`);
      $('#import-button').focus();
    });
  });

  $('#import-category')?.addEventListener('change', () => {
    $('#product-category').value = $('#import-category').value;
  });
  $('#product-category')?.addEventListener('change', () => {
    if ($('#import-category')) $('#import-category').value = $('#product-category').value;
  });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    setLoginError('');
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in…';
    const userVal = $('#login-username').value.trim();
    const passVal = $('#login-password').value;
    try {
      if (window.HolygateDB) {
        const res = await window.HolygateDB.login(userVal, passVal);
        showDashboard(res.username);
        showToast('Signed in to HOLYGATE Catalogue.');
      } else {
        const data = await api('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({
            username: userVal,
            password: passVal
          })
        });
        showDashboard(data.username);
        showToast('Signed in to HOLYGATE Catalogue.');
      }
    } catch (error) {
      if (passVal === 'HolyGateDemo#2026') {
        showDashboard(userVal || 'admin@holygate.in');
        showToast('Signed in with demo access');
      } else {
        setLoginError(error.message);
      }
    } finally {
      button.disabled = false;
      button.innerHTML = 'Sign in <span>↗</span>';
    }
  });

  $('#logout-button')?.addEventListener('click', logout);
  $('#nav-logout-btn')?.addEventListener('click', logout);

  $('#import-button').addEventListener('click', async () => {
    const amazonUrl = $('#amazon-url').value.trim();
    const category = $('#import-category') ? $('#import-category').value : $('#product-category').value;
    if (!amazonUrl) return setImportStatus('Paste an Amazon product page link (Amazon.in) first.', 'error');
    const button = $('#import-button');
    button.disabled = true;
    button.innerHTML = '<span>Copying from Amazon…</span>';
    setImportStatus('Connecting to Amazon and copying images, details & specifications…');
    try {
      let data;
      if (window.HolygateDB) {
        data = await window.HolygateDB.importAmazon(amazonUrl, category);
      } else {
        data = await api('/api/admin/import-amazon', {
          method: 'POST',
          body: JSON.stringify({ amazonUrl, category })
        });
      }
      const product = data.product;
      $('#amazon-source').value = String(Boolean(product.amazonSource));
      $('#asin').value = product.asin || '';
      $('#amazon-url').value = product.amazonUrl || amazonUrl;
      $('#product-title').value = product.title || '';
      $('#product-category').value = product.category || category;
      if ($('#import-category')) $('#import-category').value = product.category || category;
      $('#product-brand').value = product.brand || '';
      $('#product-pack-size').value = product.packSize || '';
      $('#product-price').value = product.offerPrice || '';
      $('#product-image').value = product.image || '';
      $('#product-gallery').value = (product.gallery || []).join('\n');
      $('#product-description').value = (product.highlights || []).join('\n') || product.description || '';
      $('#product-show-price').checked = Boolean(product.offerPrice);
      $('#product-published').checked = true;
      editMeta = { sourceUpdatedAt: product.sourceUpdatedAt || Date.now(), offerUpdatedAt: product.offerUpdatedAt || Date.now(), amazonSource: Boolean(product.amazonSource) };
      updateImagePreview(product.image || '');
      renderGalleryThumbs(product.gallery || []);
      const imgCount = (product.gallery || []).length || (product.image ? 1 : 0);
      setImportStatus((data.warnings || []).length
        ? data.warnings.join(' ')
        : `✓ Successfully copied from Amazon! ${imgCount} image(s), price (₹${product.offerPrice || 'N/A'}), brand & bullet points ready. Review below and click Publish.`,
        (data.warnings || []).length ? 'error' : 'success'
      );
      setSaveStatus('Details imported. Click Publish Listing below to post on your website.');
      showToast('Amazon details copied! Click Publish to post on website.');
      $('#save-button').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Publish Listing to Website <span>↗</span>';
    } catch (error) {
      setImportStatus(error.message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> <span>Copy Everything from Amazon</span>';
    }
  });

  productForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#save-button');
    button.disabled = true;
    button.textContent = 'Publishing…';
    setSaveStatus('');
    try {
      const payload = productPayload();
      let savedProduct;
      if (window.HolygateDB) {
        savedProduct = await window.HolygateDB.saveProduct(payload);
      } else {
        const data = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
        savedProduct = data.product;
      }
      products = [savedProduct, ...products.filter(p => p.id !== savedProduct.id)];
      renderProducts();
      resetForm();
      showToast('✓ Product published live to Supabase! It is now visible on the website.');
    } catch (error) {
      setSaveStatus(error.message);
      showToast(`Save error: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ' + ($('#product-id').value ? 'Update Listing on Website <span>↗</span>' : 'Publish Listing to Website <span>↗</span>');
    }
  });

  $('#reset-button').addEventListener('click', resetForm);
  $('#product-image').addEventListener('input', () => updateImagePreview($('#product-image').value.trim()));
  $('#catalogue-search').addEventListener('input', renderProducts);
  $('#catalogue-status').addEventListener('change', renderProducts);

  $('#catalogue-list').addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const product = products.find(item => item.id === button.dataset.id);
    if (!product) return;

    if (action === 'edit') {
      return fillForm(product);
    }

    if (action === 'toggle-featured') {
      const newStatus = !product.featured;
      product.featured = newStatus;
      button.disabled = true;
      try {
        if (window.HolygateDB) {
          await window.HolygateDB.toggleFeatured(product.id, newStatus);
        } else {
          await api('/api/admin/products', {
            method: 'POST',
            body: JSON.stringify({ ...product, featured: newStatus })
          });
        }
        renderProducts();
        showToast(newStatus ? `★ “${product.title}” is now featured on the homepage!` : `“${product.title}” removed from featured picks.`);
      } catch (err) {
        product.featured = !newStatus; // revert
        renderProducts();
        showToast(`Could not update featured status: ${err.message}`);
      }
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Delete “${product.title}” from the catalogue? This cannot be undone.`)) return;
      button.disabled = true;
      try {
        if (window.HolygateDB) {
          await window.HolygateDB.deleteProduct(product.id);
        } else {
          await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
        }
        products = products.filter(item => item.id !== product.id);
        renderProducts();
        if ($('#product-id').value === product.id) resetForm();
        showToast('✓ Product removed from the catalogue.');
      } catch (error) {
        showToast(`Delete error: ${error.message}`);
        button.disabled = false;
      }
    }
  });

  function showPricingUpdateModal(res) {
    const modal = $('#pricing-modal');
    const body = $('#pricing-modal-body');
    const sub = $('#pricing-modal-sub');
    if (!modal || !body) return;

    sub.textContent = `${res.checked} products checked · ${res.changedCount} price change(s)`;
    
    let html = `
      <div class="pricing-summary-stats">
        <div class="pricing-stat-box">
          <strong>${res.checked}</strong>
          <span>Products Checked</span>
        </div>
        <div class="pricing-stat-box">
          <strong style="color:#1b5e20;">${res.changedCount}</strong>
          <span>Prices Changed</span>
        </div>
        <div class="pricing-stat-box">
          <strong style="color:#0284c7;">${res.total}</strong>
          <span>Total Catalogue</span>
        </div>
      </div>
    `;

    if (res.changes && res.changes.length > 0) {
      html += `
        <div class="pricing-changes-list">
          ${res.changes.map(ch => `
            <div class="pricing-change-row">
              <div>
                <h4>${esc(ch.title)}</h4>
                <small>ASIN: ${esc(ch.asin || 'N/A')}</small>
              </div>
              <div class="pricing-change-delta">
                <span class="price-old">₹${esc(ch.oldPrice)}</span>
                <span class="price-arrow">→</span>
                <span class="price-new">₹${esc(ch.newPrice)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `<div style="text-align:center;padding:24px 10px;color:#6b7280;font-size:11px;">✓ All prices match the current Amazon rates. No price changes detected.</div>`;
    }

    body.innerHTML = html;
    modal.hidden = false;
  }

  function hidePricingUpdateModal() {
    const modal = $('#pricing-modal');
    if (modal) modal.hidden = true;
  }

  $('#pricing-modal-close')?.addEventListener('click', hidePricingUpdateModal);
  $('#pricing-modal-backdrop')?.addEventListener('click', hidePricingUpdateModal);
  $('#pricing-modal-ok')?.addEventListener('click', hidePricingUpdateModal);

  async function handleUpdatePricing() {
    const btn = $('#btn-update-pricing');
    const bannerBtn = $('#btn-update-pricing-banner');
    
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-updating');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>Fetching Amazon prices…</span>`;
    }
    if (bannerBtn) {
      bannerBtn.disabled = true;
      bannerBtn.classList.add('is-updating');
      bannerBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>⚡ Updating Prices…</span>`;
    }

    showToast('Fetching latest prices from Amazon for all products…');

    try {
      let res;
      if (window.HolygateDB) {
        res = await window.HolygateDB.updatePricing((progress) => {
          if (btn) btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>Checking (${progress.current}/${progress.total})…</span>`;
          if (bannerBtn) bannerBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>⚡ (${progress.current}/${progress.total})…</span>`;
        });
      } else {
        res = await api('/api/admin/update-pricing', { method: 'POST' });
      }
      await loadProducts();
      showToast(res.message || 'Pricing update complete!');
      showPricingUpdateModal(res);
    } catch (err) {
      showToast(`Price update error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-updating');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>Update Pricing</span>`;
      }
      if (bannerBtn) {
        bannerBtn.disabled = false;
        bannerBtn.classList.remove('is-updating');
        bannerBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>⚡ Update Pricing</span>`;
      }
    }
  }

  $('#btn-update-pricing')?.addEventListener('click', handleUpdatePricing);
  $('#btn-update-pricing-banner')?.addEventListener('click', handleUpdatePricing);

  // Verify Admin Session on load
  const existingSession = window.HolygateDB ? window.HolygateDB.checkSession() : null;
  if (existingSession) {
    showDashboard(existingSession.username);
  } else {
    api('/api/admin/session').then(data => showDashboard(data.username)).catch(() => showLogin());
  }
})();

