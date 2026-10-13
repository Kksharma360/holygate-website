'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'products.json');
function loadEnv() {
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read .env:', error.message);
  }
}
loadEnv();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin@holygate.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HolyGateDemo#2026';
const COOKIE_NAME = 'holygate_admin';
const SESSION_MAX_AGE = 6 * 60 * 60 * 1000;
const sessions = new Map();
let cachedAmazonToken = null;
let cachedAmazonTokenExpiry = 0;
let amazonRefreshPromise = null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function readProducts() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
function writeProducts(products) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(products, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function supabaseConfigured() {
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    loadEnv();
  }
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

async function supabaseFetch(endpoint, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const url = `${base}/rest/v1/${endpoint}`;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return await fetch(url, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function toSupabaseRow(p) {
  return {
    id: String(p.id),
    title: String(p.title || ''),
    category: String(p.category || 'Pulses & Lentils'),
    description: String(p.description || ''),
    brand: String(p.brand || 'HOLYGATE'),
    pack_size: String(p.packSize || ''),
    image: String(p.image || ''),
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    amazon_url: String(p.amazonUrl || ''),
    asin: String(p.asin || ''),
    offer_price: String(p.offerPrice || ''),
    featured: Boolean(p.featured),
    published: p.published !== false,
    show_offer_price: Boolean(p.showOfferPrice),
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    amazon_source: Boolean(p.amazonSource),
    source_updated_at: Number(p.sourceUpdatedAt || 0),
    offer_updated_at: Number(p.offerUpdatedAt || 0),
    updated_at: p.updatedAt || new Date().toISOString()
  };
}

function fromSupabaseRow(r) {
  return {
    id: r.id,
    title: r.title,
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

async function getProducts() {
  if (supabaseConfigured()) {
    try {
      const res = await supabaseFetch('products?select=*&order=created_at.desc');
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map(fromSupabaseRow);
        }
      } else {
        console.warn(`Supabase query status ${res.status}, using local catalogue fallback.`);
      }
    } catch (err) {
      console.warn('Supabase fetch error, using local fallback:', err.message);
    }
  }
  return readProducts();
}

async function saveProductRecord(product) {
  if (supabaseConfigured()) {
    try {
      const row = toSupabaseRow(product);
      const res = await supabaseFetch('products', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(row)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Supabase write error:', res.status, errText);
      }
    } catch (err) {
      console.error('Supabase write error:', err.message);
    }
  }
  const products = readProducts();
  const index = products.findIndex(p => p.id === product.id);
  if (index >= 0) products[index] = product; else products.unshift(product);
  writeProducts(products);
  return product;
}

async function deleteProductRecord(id) {
  if (supabaseConfigured()) {
    try {
      await supabaseFetch(`products?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Supabase delete error:', err.message);
    }
  }
  const products = readProducts();
  const filtered = products.filter(p => p.id !== id);
  writeProducts(filtered);
  return true;
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}
function sessionUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return null; }
  sessions.set(token, Date.now() + SESSION_MAX_AGE);
  return ADMIN_USER;
}
function requireAdmin(req, res) {
  if (sessionUser(req)) return true;
  json(res, 401, { error: 'Please sign in to the admin dashboard again.' });
  return false;
}
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) { reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error('Invalid JSON request.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
async function normalizeAmazonUrl(value) {
  let urlStr = String(value || '').trim();
  if (!urlStr) throw new Error('Enter a valid Amazon product URL.');
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  let url;
  try { url = new URL(urlStr); }
  catch { throw new Error('Enter a valid Amazon product URL.'); }
  
  if (['amzn.in', 'amzn.to', 'www.amzn.in', 'www.amzn.to'].includes(url.hostname.toLowerCase())) {
    try {
      const resp = await fetch(urlStr, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
      });
      if (resp.url) url = new URL(resp.url);
    } catch (e) {}
  }

  const match = url.href.match(/\/(?:dp|gp\/product|gp\/aw\/d|product|ASIN)\/([A-Z0-9]{10})(?:[/?&#]|$)/i) ||
                url.href.match(/[\/?&#]asin=([A-Z0-9]{10})/i) ||
                url.href.match(/\/([A-Z0-9]{10})(?:[/?&#]|$)/i);
  if (!match) throw new Error('Could not find a 10-character ASIN in that URL. Open the product page on Amazon.in and copy its link.');
  const asin = match[1].toUpperCase();
  return { asin, url: `https://www.amazon.in/dp/${asin}` };
}
function amazonConfigured() {
  return Boolean(process.env.AMAZON_CLIENT_ID && process.env.AMAZON_CLIENT_SECRET && process.env.AMAZON_PARTNER_TAG);
}
async function getAmazonToken() {
  if (cachedAmazonToken && cachedAmazonTokenExpiry > Date.now() + 60_000) return cachedAmazonToken;
  const tokenUrl = process.env.AMAZON_TOKEN_URL || 'https://api.amazon.co.uk/auth/o2/token';
  const response = await fetch(tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: process.env.AMAZON_CLIENT_ID,
      client_secret: process.env.AMAZON_CLIENT_SECRET, scope: 'creatorsapi::default' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.message || `Amazon authentication failed (${response.status}). Check Creators API credentials and token region.`);
  cachedAmazonToken = data.access_token;
  cachedAmazonTokenExpiry = Date.now() + (Number(data.expires_in || 3600) * 1000);
  return cachedAmazonToken;
}
function firstValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value.displayValue ?? value.displayAmount ?? value.amount ?? '');
}
function inferCategory(title = '') {
  const value = title.toLowerCase();
  if (/rice|chawal|basmati|masoori|biryani|grain|millet|oat grain|poha|barley|quinoa/i.test(value)) return 'Grains';
  if (/atta|flour|sattu|besan|maida|sooji|suji|rava/i.test(value)) return 'Atta & Flour';
  if (/sugar|khand|jaggery|gur|mishri|sweetener/i.test(value)) return 'Sugar';
  if (/chia|seed|flax|sabja|sesame|pumpkin|sunflower/i.test(value)) return 'Seeds';
  if (/dal|lentil|pulse|rajma|chickpea|chana|moong|masoor|toor|urad|arhar|lobia|kulthi/i.test(value)) return 'Pulses & Lentils';
  if (/soya|soy chunk|sabudana|tapioca/i.test(value)) return 'Others';
  return 'Others';
}
function transformAmazonItem(item, existing = {}) {
  const info = item.itemInfo || {};
  const title = firstValue(info.title) || existing.title || 'Amazon product';
  const imageSet = item.images || {};
  const primary = imageSet.primary || {};
  const image = primary.hiRes?.url || primary.large?.url || primary.medium?.url || primary.small?.url || existing.image || '';
  const gallery = [];
  const largeVariants = Array.isArray(imageSet.variants?.large) ? imageSet.variants.large : (imageSet.variants?.large ? [imageSet.variants.large] : []);
  const mediumVariants = Array.isArray(imageSet.variants?.medium) ? imageSet.variants.medium : (imageSet.variants?.medium ? [imageSet.variants.medium] : []);
  for (const itemImage of [primary.hiRes, primary.large, primary.medium, ...largeVariants, ...mediumVariants]) {
    if (itemImage?.url && !gallery.includes(itemImage.url)) gallery.push(itemImage.url);
  }
  const features = info.features?.displayValues || [];
  const brand = firstValue(info.byLineInfo?.brand) || firstValue(info.byLineInfo?.manufacturer) || '';
  const classifications = info.classifications || {};
  const categoryGuess = firstValue(classifications.productGroup) || inferCategory(title);
  const listing = (item.offersV2?.listings || []).find(listing => listing.price?.money?.amount || listing.price?.displayAmount);
  const price = listing?.price?.money?.amount != null ? String(listing.price.money.amount) : (listing?.price?.displayAmount || '');
  const detailPageUrl = item.detailPageURL || existing.amazonUrl;
  return {
    ...existing,
    id: existing.id || crypto.randomUUID(),
    title,
    category: existing.category || inferCategory(`${categoryGuess} ${title}`),
    description: features.join('\n'),
    highlights: features,
    brand,
    packSize: firstValue(info.productInfo?.size) || existing.packSize || '',
    asin: item.asin || existing.asin || '',
    amazonUrl: detailPageUrl || existing.amazonUrl,
    image,
    gallery,
    amazonSource: true,
    sourceUpdatedAt: Date.now(),
    offerPrice: price,
    offerUpdatedAt: Date.now(),
    showOfferPrice: Boolean(price),
    published: existing.published !== false,
    featured: Boolean(existing.featured),
    updatedAt: new Date().toISOString()
  };
}
function decodeHtml(value = '') {
  return String(value).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi, token => ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[token.toLowerCase()] || token);
}
function amazonHtmlMetadata(html, parsed, existing = {}, requestedCategory = '') {
  let title = '';
  const titleMatch = html.match(/id=["']productTitle["'][^>]*>\s*([\s\S]*?)\s*<\/span>/i) ||
                     html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
                     html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtml(titleMatch[1]).replace(/\s*[:|]\s*Amazon\..*$/i, '').trim();
  }

  let brand = '';
  const brandMatch = html.match(/id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i) ||
                     html.match(/class=["'][^"']*po-brand[^"']*["'][\s\S]*?class=["'][^"']*po-break-word[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  if (brandMatch) {
    brand = decodeHtml(brandMatch[1])
      .replace(/<[^>]+>/g, '')
      .replace(/^\s*(?:Visit the|Brand:|Brand)\s+/i, '')
      .replace(/\s+(?:Store|Brand)\s*$/i, '')
      .trim();
  }

  const gallery = [];
  const dynamicMatch = html.match(/data-a-dynamic-image=["'](\{[\s\S]*?\})["']/i);
  if (dynamicMatch) {
    try {
      const parsedDyn = JSON.parse(dynamicMatch[1].replace(/&quot;/g, '"'));
      const sorted = Object.entries(parsedDyn).sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
      sorted.forEach(([imgUrl]) => {
        if (/^https:\/\//i.test(imgUrl) && !gallery.includes(imgUrl)) gallery.push(imgUrl);
      });
    } catch (e) {}
  }
  const colorMatch = html.match(/'colorImages':\s*\{\s*'initial':\s*(\[\s*\{[\s\S]*?\}\s*\])\s*\}/i);
  if (colorMatch) {
    try {
      const items = JSON.parse(colorMatch[1].replace(/'/g, '"'));
      for (const item of items) {
        const u = item.hiRes || item.large || item.main?.url;
        if (u && /^https:\/\//i.test(u) && !gallery.includes(u)) gallery.push(u);
      }
    } catch (e) {}
  }
  const landingMatch = html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i) ||
                       html.match(/data-old-hires=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (landingMatch && !gallery.includes(landingMatch[1])) {
    gallery.unshift(landingMatch[1]);
  }
  const image = gallery[0] || existing.image || '';

  let offerPrice = '';
  const priceMatch = html.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
                     html.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (priceMatch) {
    offerPrice = priceMatch[1].replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '').replace(/\.$/, '').trim();
  }

  const highlights = [];
  const bulletBlock = html.match(/id=["']feature-bullets["'][\s\S]*?<\/ul>/i);
  if (bulletBlock) {
    const items = Array.from(bulletBlock[0].matchAll(/<span class=["']a-list-item["'][^>]*>([\s\S]*?)<\/span>/gi));
    for (const m of items) {
      const text = decodeHtml(m[1]).replace(/<[^>]+>/g, '').trim();
      if (text && !highlights.includes(text)) highlights.push(text);
    }
  }

  const descMatch = html.match(/id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i);
  let description = '';
  if (descMatch) {
    description = decodeHtml(descMatch[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!description && highlights.length) {
    description = highlights.join('\n');
  }

  let packSize = '';
  const sizeMatch = html.match(/class=["'][^"']*po-item_weight[^"']*["'][\s\S]*?class=["'][^"']*po-break-word[^"']*["'][^>]*>([\s\S]*?)<\/td>/i) ||
                    title.match(/\b(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms|litre|liter|l|ml|pack of \d+))\b/i);
  if (sizeMatch) {
    packSize = decodeHtml(sizeMatch[1]).replace(/<[^>]+>/g, '').trim();
  }

  if (!title || /robot check|captcha/i.test(title)) {
    throw new Error('Amazon verification requested. Product link saved; please review details below.');
  }

  const category = requestedCategory || existing.category || inferCategory(title);

  return {
    ...existing,
    id: existing.id || crypto.randomUUID(),
    title,
    category,
    description,
    highlights,
    brand: brand || existing.brand || 'HOLYGATE',
    packSize: packSize || existing.packSize || '',
    asin: parsed.asin,
    amazonUrl: parsed.url,
    image,
    gallery: gallery.slice(0, 10),
    amazonSource: true,
    sourceUpdatedAt: Date.now(),
    offerPrice,
    offerUpdatedAt: Date.now(),
    showOfferPrice: Boolean(offerPrice),
    published: existing.published !== false,
    featured: Boolean(existing.featured),
    updatedAt: new Date().toISOString()
  };
}
async function importAmazonWithoutApi(parsed, existing = {}, requestedCategory = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
  try {
    const response = await fetch(`https://www.amazon.in/dp/${parsed.asin}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Cache-Control': 'max-age=0'
      },
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Amazon responded with status ${response.status}.`);
    const html = (await response.text()).slice(0, 4000000);
    return amazonHtmlMetadata(html, parsed, existing, requestedCategory);
  } finally { clearTimeout(timeout); }
}
async function callAmazonGetItems(asins) {
  if (!amazonConfigured()) throw new Error('Automatic Amazon import is not configured yet. Add AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET and AMAZON_PARTNER_TAG to your .env file. Manual product creation works without these.');
  const token = await getAmazonToken();
  const marketplace = process.env.AMAZON_MARKETPLACE || 'www.amazon.in';
  const body = {
    itemIds: asins,
    itemIdType: 'ASIN',
    marketplace,
    partnerTag: process.env.AMAZON_PARTNER_TAG,
    languagesOfPreference: ['en_IN'],
    currencyOfPreference: 'INR',
    resources: [
      'images.primary.hiRes', 'images.primary.large', 'images.primary.medium', 'images.variants.large',
      'itemInfo.title', 'itemInfo.features', 'itemInfo.byLineInfo', 'itemInfo.classifications',
      'itemInfo.productInfo', 'itemInfo.manufactureInfo', 'itemInfo.technicalInfo',
      'offersV2.listings.price', 'offersV2.listings.availability', 'offersV2.listings.condition'
    ]
  };
  const response = await fetch('https://creatorsapi.amazon/catalog/v1/getItems', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-marketplace': marketplace }, body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.message || `Amazon Creators API request failed (${response.status}).`);
  const items = data.itemResults?.items || [];
  if (!items.length) throw new Error(data.errors?.[0]?.message || 'Amazon returned no product details for this ASIN. Confirm the item is accessible to your Creators API account.');
  return { items, errors: data.errors || [] };
}
async function refreshAmazonProductsIfNeeded() {
  if (!amazonConfigured() || amazonRefreshPromise) return amazonRefreshPromise || undefined;
  const products = readProducts();
  const now = Date.now();
  const stale = products.filter(p => p.amazonSource && p.asin && ((now - Number(p.sourceUpdatedAt || 0)) > 23 * 60 * 60 * 1000 || (p.offerPrice && (now - Number(p.offerUpdatedAt || 0)) > 55 * 60 * 1000)));
  if (!stale.length) return;
  amazonRefreshPromise = (async () => {
    let changed = false;
    for (let i = 0; i < stale.length; i += 10) {
      const group = stale.slice(i, i + 10);
      try {
        const { items } = await callAmazonGetItems(group.map(p => p.asin));
        const returnedAsins = new Set(items.map(item => item.asin));
        for (const item of items) {
          const index = products.findIndex(p => p.asin === item.asin);
          if (index >= 0) { products[index] = transformAmazonItem(item, products[index]); changed = true; }
        }
        for (const requested of group) {
          if (!returnedAsins.has(requested.asin)) {
            const index = products.findIndex(p => p.id === requested.id);
            if (index >= 0) {
              products[index].offerPrice = '';
              products[index].showOfferPrice = false;
              if ((now - Number(products[index].sourceUpdatedAt || 0)) > 24 * 60 * 60 * 1000) products[index].published = false;
              changed = true;
            }
          }
        }
      } catch (error) {
        console.error('Amazon auto-refresh skipped:', error.message);
        for (const requested of group) {
          const index = products.findIndex(p => p.id === requested.id);
          if (index < 0) continue;
          if (requested.offerPrice && (now - Number(requested.offerUpdatedAt || 0)) > 60 * 60 * 1000) {
            products[index].offerPrice = '';
            products[index].showOfferPrice = false;
            changed = true;
          }
          if ((now - Number(requested.sourceUpdatedAt || 0)) > 24 * 60 * 60 * 1000) {
            products[index].published = false;
            changed = true;
          }
        }
      }
    }
    if (changed) writeProducts(products);
  })().finally(() => { amazonRefreshPromise = null; });
  return amazonRefreshPromise;
}

async function fetchDirectAmazonPrice(asin) {
  const url = `https://www.amazon.in/dp/${asin}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 3000000);
    if (/robot check|captcha/i.test(html)) return null;
    const whole = html.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const offscreen = html.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    let price = '';
    if (whole) {
      price = whole[1].replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '').replace(/\.$/, '').trim();
    } else if (offscreen) {
      price = offscreen[1].replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '').replace(/\.$/, '').trim();
    }
    return price ? String(Math.round(parseFloat(price))) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function updateAllProductPricing() {
  const products = await getProducts();
  const now = Date.now();
  const changes = [];
  let checkedCount = 0;
  let updatedCount = 0;

  const targets = products.filter(p => p.asin || (p.amazonUrl && /dp\/([A-Z0-9]{10})/i.test(p.amazonUrl)));

  const apiPriceMap = new Map();
  if (amazonConfigured()) {
    for (let i = 0; i < targets.length; i += 10) {
      const chunk = targets.slice(i, i + 10);
      try {
        const { items } = await callAmazonGetItems(chunk.map(p => p.asin).filter(Boolean));
        for (const item of (items || [])) {
          const offer = item.offersV2?.listings?.[0]?.price?.amount ||
                        item.offersV2?.listings?.[0]?.price?.displayAmount ||
                        item.offersV2?.listings?.[0]?.price?.value;
          if (offer) {
            const numeric = String(Math.round(parseFloat(String(offer).replace(/[^\d.]/g, ''))));
            if (numeric && numeric !== 'NaN') apiPriceMap.set(item.asin, numeric);
          }
        }
      } catch (e) {
        console.warn('Amazon API batch fetch skipped:', e.message);
      }
    }
  }

  const needDirect = targets.filter(p => !apiPriceMap.has(p.asin));
  const CONCURRENCY = 6;
  const directResults = new Map();

  for (let i = 0; i < needDirect.length; i += CONCURRENCY) {
    const batch = needDirect.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async p => {
      const asin = p.asin || (p.amazonUrl ? p.amazonUrl.match(/dp\/([A-Z0-9]{10})/i)?.[1] : null);
      if (!asin) return;
      const price = await fetchDirectAmazonPrice(asin);
      if (price) directResults.set(p.id, price);
    }));
  }

  for (const p of products) {
    const newPrice = apiPriceMap.get(p.asin) || directResults.get(p.id);
    if (newPrice) {
      checkedCount++;
      const oldPrice = p.offerPrice ? String(p.offerPrice) : '';
      if (oldPrice !== newPrice) {
        changes.push({
          id: p.id,
          title: p.title,
          oldPrice: oldPrice || 'None',
          newPrice: newPrice,
          asin: p.asin
        });
      }
      p.offerPrice = newPrice;
      p.showOfferPrice = true;
      p.offerUpdatedAt = now;
      p.sourceUpdatedAt = now;
      p.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  }

  writeProducts(products);

  if (supabaseConfigured()) {
    try {
      const rows = products.map(toSupabaseRow);
      const res = await supabaseFetch('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(rows)
      });
      if (!res.ok) {
        console.error('Supabase bulk upsert returned status:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Supabase bulk pricing update error:', err.message);
    }
  }

  return {
    ok: true,
    total: products.length,
    checked: checkedCount,
    updated: updatedCount,
    changedCount: changes.length,
    changes,
    message: changes.length > 0
      ? `Updated prices for ${checkedCount} products from Amazon (${changes.length} price change${changes.length === 1 ? '' : 's'} detected).`
      : `Verified prices for ${checkedCount} products from Amazon. All prices are up to date.`
  };
}

function validateProduct(input, existing = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Product title is required.');
  const allowedCategories = ['Pulses & Lentils', 'Atta & Flour', 'Grains', 'Sugar', 'Seeds', 'Pantry Staples', 'Others'];
  const category = allowedCategories.includes(input.category) ? input.category : inferCategory(title);
  const amazonUrl = String(input.amazonUrl || '').trim();
  if (amazonUrl) {
    let link; try { link = new URL(amazonUrl); } catch { throw new Error('Enter a valid Amazon product link.'); }
    const host = link.hostname.toLowerCase();
    if (!['amazon.in', 'www.amazon.in'].includes(host) && !host.endsWith('.amazon.in')) throw new Error('Only Amazon.in product links are supported.');
  }
  let image = String(input.image || '').trim();
  if (image && !/^https?:\/\//i.test(image) && !image.startsWith('/assets/')) throw new Error('Image must be an HTTPS/HTTP URL or a local /assets path.');
  const titleSafeDefaults = {};
  const allowedFields = ['id', 'title', 'category', 'description', 'brand', 'packSize', 'image', 'gallery', 'amazonUrl', 'asin', 'offerPrice', 'featured', 'published', 'showOfferPrice', 'highlights', 'amazonSource', 'sourceUpdatedAt', 'offerUpdatedAt', 'updatedAt', 'rating', 'ratingCount'];
  for (const key of allowedFields) if (input[key] !== undefined) titleSafeDefaults[key] = input[key];
  return {
    ...existing,
    ...titleSafeDefaults,
    id: existing.id || input.id || crypto.randomUUID(),
    title,
    category,
    description: String(input.description || '').slice(0, 10000),
    brand: String(input.brand || '').slice(0, 160),
    packSize: String(input.packSize || '').slice(0, 80),
    image,
    gallery: Array.isArray(input.gallery) ? input.gallery.filter(v => typeof v === 'string' && /^https?:\/\//i.test(v)).slice(0, 10) : (existing.gallery || []),
    amazonUrl,
    asin: String(input.asin || '').toUpperCase().slice(0, 10),
    offerPrice: String(input.offerPrice || '').slice(0, 40),
    rating: String(input.rating || existing.rating || '4.8').slice(0, 10),
    ratingCount: String(input.ratingCount || existing.ratingCount || '1,240+').slice(0, 40),
    showOfferPrice: Boolean(input.showOfferPrice),
    featured: Boolean(input.featured),
    published: input.published !== false,
    highlights: Array.isArray(input.highlights) ? input.highlights.map(v => String(v).slice(0, 500)).slice(0, 30) : String(input.description || '').split('\n').filter(Boolean).slice(0, 30),
    amazonSource: Boolean(input.amazonSource),
    sourceUpdatedAt: Number(input.sourceUpdatedAt || existing.sourceUpdatedAt || 0),
    offerUpdatedAt: Number(input.offerUpdatedAt || existing.offerUpdatedAt || 0),
    updatedAt: new Date().toISOString()
  };
}
function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (decoded === '/') decoded = '/index.html';
  if (decoded === '/admin') decoded = '/admin.html';
  if (decoded === '/product') decoded = '/product.html';
  const resolved = path.resolve(PUBLIC, `.${decoded}`);
  if (!resolved.startsWith(PUBLIC + path.sep) && resolved !== path.join(PUBLIC, 'index.html')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(resolved, (err, content) => {
    if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(err.code === 'ENOENT' ? 'Not found' : 'Could not read file'); }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-store, no-cache, must-revalidate' : 'public, max-age=3600', 'Pragma': (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-cache' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  try {
    if (req.method === 'GET' && pathname === '/api/products') {
      await refreshAmazonProductsIfNeeded();
      const products = await getProducts();
      return json(res, 200, { products: products.filter(p => p.published !== false) });
    }
    if (req.method === 'GET' && pathname.startsWith('/api/products/')) {
      const id = decodeURIComponent(pathname.slice('/api/products/'.length));
      const products = await getProducts();
      const product = products.find(p => (p.id === id || p.asin === id) && p.published !== false);
      if (!product) return json(res, 404, { error: 'Product not found.' });
      return json(res, 200, { product });
    }
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const body = await readBody(req);
      if (!safeEqual(body.username || '', ADMIN_USER) || !safeEqual(body.password || '', ADMIN_PASSWORD)) return json(res, 401, { error: 'Email or password is incorrect.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MAX_AGE);
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      return json(res, 200, { ok: true, username: ADMIN_USER }, { 'Set-Cookie': `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}${secure}` });
    }
    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }
    if (req.method === 'GET' && pathname === '/api/admin/session') {
      const username = sessionUser(req);
      return json(res, username ? 200 : 401, username ? { ok: true, username } : { ok: false, error: 'Not signed in.' });
    }
    if (pathname.startsWith('/api/admin/')) {
      if (!requireAdmin(req, res)) return;
      if (req.method === 'GET' && pathname === '/api/admin/supabase-status') {
        if (!supabaseConfigured()) {
          return json(res, 200, { configured: false, connected: false, message: 'Supabase credentials not set in .env' });
        }
        try {
          const testRes = await supabaseFetch('products?select=id&limit=1');
          if (testRes.ok) {
            return json(res, 200, { configured: true, connected: true, url: process.env.SUPABASE_URL, message: 'Connected to Supabase Cloud Database' });
          }
          const errText = await testRes.text();
          return json(res, 200, { configured: true, connected: false, url: process.env.SUPABASE_URL, error: `Supabase status ${testRes.status}: ${errText}` });
        } catch (e) {
          return json(res, 200, { configured: true, connected: false, error: e.message });
        }
      }
      if (req.method === 'POST' && pathname === '/api/admin/supabase-sync') {
        if (!supabaseConfigured()) {
          return json(res, 400, { error: 'Supabase is not configured in .env' });
        }
        const local = readProducts();
        let successCount = 0;
        const errors = [];
        for (const p of local) {
          try {
            const row = toSupabaseRow(p);
            const resUp = await supabaseFetch('products', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(row)
            });
            if (resUp.ok) successCount++;
            else errors.push(`${p.title?.slice(0, 20)}: ${await resUp.text()}`);
          } catch (err) {
            errors.push(`${p.title?.slice(0, 20)}: ${err.message}`);
          }
        }
        return json(res, 200, { synced: successCount, total: local.length, errors });
      }
      if (req.method === 'POST' && pathname === '/api/admin/update-pricing') {
        const result = await updateAllProductPricing();
        return json(res, 200, result);
      }
      if (req.method === 'GET' && pathname === '/api/admin/products') {
        const products = await getProducts();
        return json(res, 200, { products });
      }
      if (req.method === 'POST' && pathname === '/api/admin/import-amazon') {
        const body = await readBody(req);
        const parsedAmazon = await normalizeAmazonUrl(body.amazonUrl);
        const requestedCategory = body.category || '';
        const currentProducts = await getProducts();
        const previous = currentProducts.find(p => p.asin === parsedAmazon.asin) || {};
        if (amazonConfigured()) {
          const { items, errors } = await callAmazonGetItems([parsedAmazon.asin]);
          const product = transformAmazonItem(items[0], { ...previous, asin: parsedAmazon.asin });
          if (requestedCategory) product.category = requestedCategory;
          product.amazonUrl = items[0].detailPageURL || parsedAmazon.url;
          return json(res, 200, { product, warnings: errors.map(e => e.message).filter(Boolean) });
        }
        try {
          const product = await importAmazonWithoutApi(parsedAmazon, previous, requestedCategory);
          return json(res, 200, { product, warnings: product.image ? [] : ['Amazon did not expose an image. Review details below.'] });
        } catch (error) {
          const product = {
            ...previous,
            asin: parsedAmazon.asin,
            amazonUrl: parsedAmazon.url,
            category: requestedCategory || previous.category || 'Pulses & Lentils',
            brand: previous.brand || 'HOLYGATE',
            amazonSource: false
          };
          return json(res, 200, { product, warnings: [`Automatic import: ${error.message}`, 'Confirm details and click Publish.'] });
        }
      }
      if (req.method === 'POST' && pathname === '/api/admin/products') {
        const body = await readBody(req);
        const currentProducts = await getProducts();
        const existing = body.id ? currentProducts.find(p => p.id === body.id) : null;
        const product = validateProduct(body, existing || {});
        const saved = await saveProductRecord(product);
        return json(res, existing ? 200 : 201, { product: saved });
      }
      if (req.method === 'DELETE' && pathname.startsWith('/api/admin/products/')) {
        const id = decodeURIComponent(pathname.slice('/api/admin/products/'.length));
        await deleteProductRecord(id);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Admin endpoint not found.' });
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'API endpoint not found.' });
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error.stack || error.message || error);
    return json(res, error.statusCode || 400, { error: error.message || 'Unexpected server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`HOLYGATE storefront running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
  if (!amazonConfigured()) console.log('Amazon import is in manual/demo mode until Creators API credentials are added to .env.');
});
