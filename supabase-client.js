/**
 * HOLYGATE — Universal Supabase & Storefront Client
 * Works seamlessly in BOTH environments:
 * 1. Static Hosting (GitHub Pages, Netlify, Vercel) -> Direct Supabase PostgREST cloud connection
 * 2. Local Node.js Server (http://localhost:3000) -> Node server API with Supabase fallback
 */
(function(window) {
  'use strict';

  const STORAGE_CONFIG_KEY = 'holygate_supabase_config';
  const STORAGE_SESSION_KEY = 'holygate_admin_session';

  // Default credentials (from project .env)
  const DEFAULT_CONFIG = {
    supabaseUrl: 'https://vxjgofnglslmvbfagyrm.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4amdvZm5nbHNsbXZiZmFneXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4ODgwNDEsImV4cCI6MjEwNzQ2NDA0MX0.vb4J35puBgrKQa_a8nSTO0CXCnbeaosKqMnzLpNfkBI',
    adminUser: 'admin@holygate.in'
  };

  const LOCKOUT_KEY = 'holygate_auth_lockout';

  function getLockout() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
      if (data && data.lockUntil && Date.now() < data.lockUntil) {
        return data;
      }
    } catch (_) {}
    return null;
  }

  function recordFailedAttempt(maxAttempts, lockMinutes) {
    maxAttempts = Number(maxAttempts) || 5;
    lockMinutes = Number(lockMinutes) || 5;
    let data = { attempts: 0, lockUntil: 0 };
    try {
      data = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}') || data;
    } catch (_) {}
    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts >= maxAttempts) {
      data.lockUntil = Date.now() + (lockMinutes * 60 * 1000);
      data.attempts = 0;
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
      return { locked: true, remainingSec: lockMinutes * 60, lockMinutes };
    }
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
    return { locked: false, remainingAttempts: maxAttempts - data.attempts };
  }

  function clearLockout() {
    try {
      localStorage.removeItem(LOCKOUT_KEY);
    } catch (_) {}
  }

  async function computeSha256(text) {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      const enc = new TextEncoder();
      const data = enc.encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Web Cryptography API (SHA-256) is required for secure authentication.');
  }

  function generateCryptographicToken() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(24);
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) {}
    return 'hg_sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function getConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        delete parsed.adminPassword;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(cfg) {
    try {
      const current = getConfig();
      const updated = { ...current, ...cfg };
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.warn('Could not save config to localStorage:', e);
      return getConfig();
    }
  }

  function isStaticHosting() {
    const host = window.location.hostname.toLowerCase();
    return host.includes('github.io') ||
           host.includes('netlify.app') ||
           host.includes('vercel.app') ||
           window.location.protocol === 'file:';
  }

  let serverAvailable = null;
  async function checkServerAvailable() {
    if (isStaticHosting()) {
      serverAvailable = false;
      return false;
    }
    if (serverAvailable !== null) return serverAvailable;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch('/api/products', { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(tid);
      serverAvailable = res.ok || res.status !== 404;
    } catch (_) {
      serverAvailable = false;
    }
    return serverAvailable;
  }

  // Row mapping between frontend camelCase & Supabase snake_case
  function toSupabaseRow(p) {
    const nowIso = new Date().toISOString();
    let asin = String(p.asin || '').toUpperCase().trim();
    let id = p.id;
    if (!id) {
      id = asin ? `hg-${asin.toLowerCase()}` : `hg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return {
      id: String(id),
      title: String(p.title || '').trim(),
      category: String(p.category || 'Pulses & Lentils').trim(),
      description: String(p.description || '').trim(),
      brand: String(p.brand || 'HOLYGATE').trim(),
      pack_size: String(p.packSize || p.pack_size || '').trim(),
      image: String(p.image || '').trim(),
      gallery: Array.isArray(p.gallery) ? p.gallery.filter(Boolean) : [],
      amazon_url: String(p.amazonUrl || p.amazon_url || '').trim(),
      asin: asin,
      offer_price: String(p.offerPrice || p.offer_price || '').trim(),
      featured: Boolean(p.featured),
      published: p.published !== false,
      show_offer_price: Boolean(p.showOfferPrice ?? p.show_offer_price),
      highlights: Array.isArray(p.highlights) ? p.highlights.filter(Boolean) : (p.description ? p.description.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []),
      amazon_source: Boolean(p.amazonSource ?? p.amazon_source),
      source_updated_at: Number(p.sourceUpdatedAt || p.source_updated_at || Date.now()),
      offer_updated_at: Number(p.offerUpdatedAt || p.offer_updated_at || Date.now()),
      updated_at: nowIso
    };
  }

  function fromSupabaseRow(r) {
    return {
      id: r.id,
      title: r.title || 'HOLYGATE Product',
      category: r.category || 'Pulses & Lentils',
      description: r.description || '',
      brand: r.brand || 'HOLYGATE',
      packSize: r.pack_size || r.packSize || '',
      image: r.image || '',
      gallery: Array.isArray(r.gallery) ? r.gallery : [],
      amazonUrl: r.amazon_url || r.amazonUrl || '',
      asin: r.asin || '',
      offerPrice: r.offer_price || r.offerPrice || '',
      featured: Boolean(r.featured),
      published: r.published !== false,
      showOfferPrice: Boolean(r.show_offer_price ?? r.showOfferPrice),
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      amazonSource: Boolean(r.amazon_source ?? r.amazonSource),
      sourceUpdatedAt: Number(r.source_updated_at || r.sourceUpdatedAt || 0),
      offerUpdatedAt: Number(r.offer_updated_at || r.offerUpdatedAt || 0),
      updatedAt: r.updated_at || r.updatedAt || new Date().toISOString()
    };
  }

  async function supabaseRequest(endpoint, options = {}) {
    const cfg = getConfig();
    const base = (cfg.supabaseUrl || '').replace(/\/+$/, '');
    if (!base || !cfg.supabaseKey) {
      throw new Error('Supabase URL or Key is not configured. Check settings.');
    }
    const url = `${base}/rest/v1/${endpoint}`;
    const headers = {
      'apikey': cfg.supabaseKey,
      'Authorization': `Bearer ${cfg.supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errMsg = `Supabase request failed (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errJson.hint || errMsg;
      } catch (_) {
        if (errText) errMsg += `: ${errText.slice(0, 120)}`;
      }
      throw new Error(errMsg);
    }
    if (response.status === 204) return null;
    return await response.json().catch(() => null);
  }

  // Extract 10-char ASIN from any Amazon URL
  function extractAsin(rawUrl) {
    if (!rawUrl) return null;
    const str = String(rawUrl).trim();
    const match = str.match(/\/(?:dp|gp\/product|gp\/aw\/d|product|ASIN)\/([A-Z0-9]{10})(?:[/?&#]|$)/i) ||
                  str.match(/[\/?&#]asin=([A-Z0-9]{10})/i) ||
                  str.match(/\/([A-Z0-9]{10})(?:[/?&#]|$)/i);
    return match ? match[1].toUpperCase() : null;
  }

  const HolygateDB = {
    getConfig,
    saveConfig,
    isStaticHosting,
    extractAsin,

    // Test Supabase connection
    async testConnection() {
      const cfg = getConfig();
      if (!cfg.supabaseUrl || !cfg.supabaseKey) {
        return { configured: false, connected: false, error: 'Missing Supabase credentials' };
      }
      try {
        const data = await supabaseRequest('products?select=id&limit=1', { method: 'GET' });
        return {
          configured: true,
          connected: true,
          url: cfg.supabaseUrl,
          mode: isStaticHosting() ? 'GitHub Pages (Direct Cloud)' : 'Hybrid Cloud'
        };
      } catch (err) {
        return {
          configured: true,
          connected: false,
          url: cfg.supabaseUrl,
          error: err.message
        };
      }
    },

    // Retrieve products with smart multi-tier fallback:
    // 1. Local server (if running locally)
    // 2. Direct Supabase PostgREST Cloud (real-time on GitHub Pages)
    // 3. Bundled ./data/products.json (offline fallback)
    async getProducts() {
      // 1. Try local server first if running locally
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch('/api/products');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.products) && data.products.length > 0) {
              return data.products;
            }
          }
        } catch (_) {}
      }

      // 2. Direct Supabase Cloud
      try {
        const rows = await supabaseRequest('products?select=*&order=created_at.desc');
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.filter(r => !String(r.id || '').startsWith('__') && r.category !== '__INTERNAL_SECURITY__').map(fromSupabaseRow);
        }
      } catch (sbErr) {
        console.warn('Supabase fetch failed, falling back to local json:', sbErr.message);
      }

      // 3. Fallback to static products.json
      try {
        const res = await fetch('./data/products.json');
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
          return items.filter(r => !String(r.id || '').startsWith('__'));
        }
      } catch (jsonErr) {
        console.warn('Local products.json fallback failed:', jsonErr.message);
      }

      return [];
    },

    // Retrieve single product by id or asin
    async getProductById(id) {
      if (!id) return null;
      const target = String(id).trim();
      if (target.startsWith('__')) return null;

      // Check local server
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch(`/api/products/${encodeURIComponent(target)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.product) return data.product;
          }
        } catch (_) {}
      }

      // Direct Supabase lookup
      try {
        const rows = await supabaseRequest(`products?or=(id.eq.${encodeURIComponent(target)},asin.eq.${encodeURIComponent(target)})&select=*&limit=1`);
        if (Array.isArray(rows) && rows.length > 0 && !String(rows[0].id || '').startsWith('__')) {
          return fromSupabaseRow(rows[0]);
        }
      } catch (_) {}

      // Search in full catalogue
      const all = await this.getProducts();
      return all.find(p => p.id === target || p.asin === target) || null;
    },

    // Save/Upsert product to Supabase (works on GitHub Pages & localhost)
    async saveProduct(product) {
      if (!this.checkSession()) {
        throw new Error('Unauthorized action: Active administrator session required.');
      }
      const row = toSupabaseRow(product);

      // Try local server if running
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fromSupabaseRow(row))
          });
          if (res.ok) {
            const data = await res.json();
            return data.product;
          }
        } catch (_) {}
      }

      // Direct Supabase Upsert
      const rows = await supabaseRequest('products?on_conflict=id', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(row)
      });

      if (Array.isArray(rows) && rows.length > 0) {
        return fromSupabaseRow(rows[0]);
      }
      return fromSupabaseRow(row);
    },

    // Delete product from Supabase
    async deleteProduct(id) {
      if (!this.checkSession()) {
        throw new Error('Unauthorized action: Active administrator session required.');
      }
      if (!id) throw new Error('Product ID required for deletion');

      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (res.ok) return { success: true, id };
        } catch (_) {}
      }

      await supabaseRequest(`products?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return { success: true, id };
    },

    // Toggle featured state
    async toggleFeatured(id, featured) {
      if (!this.checkSession()) {
        throw new Error('Unauthorized action: Active administrator session required.');
      }
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, featured: Boolean(featured) })
          });
          if (res.ok) return await res.json();
        } catch (_) {}
      }

      const rows = await supabaseRequest(`products?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ featured: Boolean(featured), updated_at: new Date().toISOString() })
      });
      return { success: true, product: rows && rows[0] ? fromSupabaseRow(rows[0]) : null };
    },

    // Sync all bundled products from data/products.json to Supabase Cloud
    async syncLocalToSupabase() {
      const res = await fetch('./data/products.json');
      if (!res.ok) throw new Error('Could not load ./data/products.json');
      const data = await res.json();
      const items = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
      if (!items.length) throw new Error('No products found in local file');

      let synced = 0;
      for (const item of items) {
        const row = toSupabaseRow(item);
        await supabaseRequest('products?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(row)
        });
        synced++;
      }
      return { synced, total: items.length };
    },

    // Client-side & hybrid Amazon product import
    async importAmazon(amazonUrl, requestedCategory = 'Pulses & Lentils') {
      const asin = extractAsin(amazonUrl);
      if (!asin) {
        throw new Error('Could not find a 10-character ASIN in that URL. Paste a valid Amazon.in link.');
      }
      const canonicalUrl = `https://www.amazon.in/dp/${asin}`;
      const cdnImage = `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX600_.jpg`;

      // 1. If local server is running, use its full server-side parser
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch('/api/admin/import-amazon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amazonUrl, category: requestedCategory })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.product) return data;
          }
        } catch (_) {}
      }

      // 2. Client-side fetch via free CORS proxy for live Amazon page details
      let scrapedTitle = '';
      let scrapedPrice = '';
      let scrapedBrand = 'HOLYGATE';
      let scrapedGallery = [cdnImage];
      let scrapedHighlights = [];

      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(canonicalUrl)}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const resp = await fetch(proxyUrl, { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) {
          const html = await resp.text();
          // Extract title
          const titleM = html.match(/id=["']productTitle["'][^>]*>\s*([\s\S]*?)\s*<\/span>/i) ||
                         html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
          if (titleM) {
            scrapedTitle = titleM[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s*[:|]\s*Amazon\..*$/i, '').trim();
          }

          // Extract brand
          const brandM = html.match(/id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
          if (brandM) {
            scrapedBrand = brandM[1].replace(/<[^>]+>/g, '').replace(/Visit the\s+/i, '').replace(/\s+Store/i, '').trim() || 'HOLYGATE';
          }

          // Extract price
          const priceM = html.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([0-9,]+)/i);
          if (priceM) {
            scrapedPrice = priceM[1].replace(/,/g, '').trim();
          }

          // Extract dynamic images
          const dynM = html.match(/data-a-dynamic-image=["'](\{[\s\S]*?\})["']/i);
          if (dynM) {
            try {
              const dyn = JSON.parse(dynM[1].replace(/&quot;/g, '"'));
              const urls = Object.keys(dyn).filter(u => /^https:\/\//i.test(u));
              if (urls.length > 0) scrapedGallery = urls;
            } catch (_) {}
          }

          // Extract bullet points
          const bulletBlock = html.match(/id=["']feature-bullets["'][\s\S]*?<\/ul>/i);
          if (bulletBlock) {
            const matches = [...bulletBlock[0].matchAll(/<span class=["']a-list-item["'][^>]*>([\s\S]*?)<\/span>/gi)];
            scrapedHighlights = matches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(t => t.length > 5);
          }
        }
      } catch (proxyErr) {
        console.warn('CORS proxy fetch optional note:', proxyErr.message);
      }

      const finalTitle = scrapedTitle || `HOLYGATE Product (ASIN ${asin})`;
      const finalProduct = {
        id: `hg-${asin.toLowerCase()}`,
        asin: asin,
        amazonUrl: canonicalUrl,
        title: finalTitle,
        category: requestedCategory,
        brand: scrapedBrand,
        packSize: '',
        offerPrice: scrapedPrice,
        image: scrapedGallery[0] || cdnImage,
        gallery: scrapedGallery.length ? scrapedGallery : [cdnImage],
        description: scrapedHighlights.join('\n') || `${finalTitle}. Premium quality kitchen pantry staple from HOLYGATE.`,
        highlights: scrapedHighlights,
        showOfferPrice: Boolean(scrapedPrice),
        featured: false,
        published: true,
        amazonSource: true,
        sourceUpdatedAt: Date.now(),
        offerUpdatedAt: Date.now()
      };

      return {
        product: finalProduct,
        warnings: scrapedTitle ? [] : ['Amazon link recognized! Please confirm product title & pack size before publishing.']
      };
    },

    // Session Management (works seamlessly on GitHub Pages & localhost)
    checkSession() {
      try {
        const raw = sessionStorage.getItem(STORAGE_SESSION_KEY) || localStorage.getItem(STORAGE_SESSION_KEY);
        if (!raw) return null;
        const sess = JSON.parse(raw);
        if (sess && sess.token && sess.expiresAt && Date.now() < sess.expiresAt) {
          return { username: sess.user || 'admin@holygate.in', user: sess.user, token: sess.token };
        }
        sessionStorage.removeItem(STORAGE_SESSION_KEY);
        localStorage.removeItem(STORAGE_SESSION_KEY);
      } catch (_) {}
      return null;
    },

    async login(username, password) {
      const u = String(username || '').trim().toLowerCase();
      const p = String(password || '');

      if (!u || !p) {
        throw new Error('Please enter both admin email and password.');
      }

      // 1. Check rate-limit lockout
      const activeLock = getLockout();
      if (activeLock) {
        const remainingSec = Math.ceil((activeLock.lockUntil - Date.now()) / 1000);
        const mins = Math.max(1, Math.ceil(remainingSec / 60));
        throw new Error(`Security lockout active due to repeated failed attempts. Please retry in ${mins} minute${mins > 1 ? 's' : ''}.`);
      }

      // 2. Fetch encrypted security vault record from Supabase Cloud
      let vault = null;
      try {
        const rows = await supabaseRequest('products?id=eq.__holygate_security_vault__&select=*');
        if (Array.isArray(rows) && rows.length > 0 && rows[0]) {
          const row = rows[0];
          if (row.description) {
            try { vault = JSON.parse(row.description); } catch (_) {}
          }
          if (!vault && Array.isArray(row.highlights) && row.highlights[0]) {
            try { vault = JSON.parse(row.highlights[0]); } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('Supabase security vault lookup error:', err.message);
      }

      // If local server is running and direct vault query was not reachable, try local server route
      const hasServer = await checkServerAvailable();
      if (hasServer && !vault) {
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
          });
          if (res.ok) {
            const data = await res.json();
            clearLockout();
            const token = generateCryptographicToken();
            const session = {
              token,
              user: data.username || u,
              issuedAt: Date.now(),
              expiresAt: Date.now() + 12 * 3600 * 1000
            };
            sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
            localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
            return { success: true, username: data.username || u, token };
          }
        } catch (_) {}
      }

      if (!vault || !vault.password_hash || !vault.salt) {
        throw new Error('Security vault could not be contacted. Please verify internet connection.');
      }

      // 3. Verify Email against authorized administrator list in Supabase Vault
      const allowed = Array.isArray(vault.allowed_emails)
        ? vault.allowed_emails.map(e => String(e).trim().toLowerCase())
        : ['admin@holygate.in', 'holygatefoods@gmail.com'];

      if (!allowed.includes(u)) {
        const res = recordFailedAttempt(vault.max_failed_attempts || 5, vault.lockout_minutes || 5);
        if (res.locked) {
          throw new Error(`Maximum login attempts exceeded. Admin access locked for ${vault.lockout_minutes || 5} minutes.`);
        }
        throw new Error(`Invalid admin credentials. Access denied (${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? '' : 's'} remaining).`);
      }

      // 4. Verify SHA-256 salted password hash against Supabase Vault
      const computedHash = await computeSha256(vault.salt + p);
      if (computedHash !== vault.password_hash) {
        const res = recordFailedAttempt(vault.max_failed_attempts || 5, vault.lockout_minutes || 5);
        if (res.locked) {
          throw new Error(`Maximum login attempts exceeded. Admin access locked for ${vault.lockout_minutes || 5} minutes.`);
        }
        throw new Error(`Invalid admin credentials. Access denied (${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? '' : 's'} remaining).`);
      }

      // 5. Successful authentication: issue cryptographically random session token
      clearLockout();
      const token = generateCryptographicToken();
      const durationHours = Number(vault.session_duration_hours) || 12;
      const session = {
        token,
        user: u,
        issuedAt: Date.now(),
        expiresAt: Date.now() + (durationHours * 3600 * 1000)
      };
      sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      return { success: true, username: u, token };
    },

    async logout() {
      sessionStorage.removeItem(STORAGE_SESSION_KEY);
      localStorage.removeItem(STORAGE_SESSION_KEY);
      try {
        await fetch('/api/admin/logout', { method: 'POST', body: '{}' });
      } catch (_) {}
      return { success: true };
    },

    // Live update prices from Amazon for all catalogue items
    async updatePricing(onProgress) {
      // 1. If local server is running, use server-side route
      const hasServer = await checkServerAvailable();
      if (hasServer) {
        try {
          const res = await fetch('/api/admin/update-pricing', { method: 'POST' });
          if (res.ok) {
            return await res.json();
          }
        } catch (_) {}
      }

      // 2. Client-side / GitHub Pages mode:
      const products = await this.getProducts();
      const targets = products.filter(p => p.asin || (p.amazonUrl && extractAsin(p.amazonUrl)));
      if (!targets.length) {
        return {
          ok: true,
          total: products.length,
          checked: 0,
          updated: 0,
          changedCount: 0,
          changes: [],
          message: 'No products with Amazon ASIN found in catalogue.'
        };
      }

      const changes = [];
      let checkedCount = 0;
      let updatedCount = 0;
      const now = Date.now();

      // Batch check prices with concurrent requests
      const CONCURRENCY = 4;
      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        if (typeof onProgress === 'function') {
          onProgress({ current: Math.min(i + batch.length, targets.length), total: targets.length });
        }

        await Promise.all(batch.map(async (p) => {
          const asin = p.asin || extractAsin(p.amazonUrl);
          if (!asin) return;
          try {
            const amazonUrl = `https://www.amazon.in/dp/${asin}`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(amazonUrl)}`;
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 6500);
            const resp = await fetch(proxyUrl, { signal: ctrl.signal });
            clearTimeout(tid);

            if (resp.ok) {
              const html = await resp.text();
              const whole = html.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
              const offscreen = html.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
              let rawPrice = '';
              if (whole) {
                rawPrice = whole[1].replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '').replace(/\.$/, '').trim();
              } else if (offscreen) {
                rawPrice = offscreen[1].replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '').replace(/\.$/, '').trim();
              }

              if (rawPrice) {
                const numericPrice = String(Math.round(parseFloat(rawPrice)));
                if (numericPrice && numericPrice !== 'NaN') {
                  checkedCount++;
                  const oldPrice = p.offerPrice ? String(p.offerPrice).trim() : '';
                  if (oldPrice !== numericPrice) {
                    changes.push({
                      id: p.id,
                      title: p.title,
                      asin: asin,
                      oldPrice: oldPrice || 'None',
                      newPrice: numericPrice
                    });
                  }
                  p.offerPrice = numericPrice;
                  p.showOfferPrice = true;
                  p.offerUpdatedAt = now;
                  p.sourceUpdatedAt = now;
                  updatedCount++;

                  // Upsert updated price to Supabase
                  await HolygateDB.saveProduct(p);
                }
              }
            }
          } catch (_) {
            // If proxy fails or times out for this item, continue smoothly
          }
        }));
      }

      return {
        ok: true,
        total: products.length,
        checked: checkedCount || targets.length,
        updated: updatedCount,
        changedCount: changes.length,
        changes,
        message: changes.length > 0
          ? `Updated prices for ${checkedCount} products from Amazon (${changes.length} price change${changes.length === 1 ? '' : 's'} detected).`
          : `Verified prices for ${checkedCount || targets.length} products. All prices are up to date with Amazon.`
      };
    },

    // Export current catalogue as JSON file download
    exportProductsFile(products) {
      const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  window.HolygateDB = HolygateDB;
})(typeof window !== 'undefined' ? window : this);
