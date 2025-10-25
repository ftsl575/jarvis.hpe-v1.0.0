import { load } from 'cheerio';
import fetchBuyHpe from './fetchBuyHpe.js';
import parseBuyHpe, { sanitizeBuyTitle } from './parseBuyHpe.js';
import { normalizePartNumber, normalizeText } from './normalize.js';

const DEFAULT_BASE_URL = 'https://buy.hpe.com/';
const DEFAULT_LOCALE = 'us/en';
const MANUAL_CHECK_STATUSES = new Set([403, 429]);

const SEARCH_CARD_SELECTORS = [
  '.product-card',
  '[data-component="product-card"]',
  '.product-card__item',
  '.product-grid__item',
  '.search-result-item',
  '.search-results__item',
  '.product-tile'
];

const SEARCH_CARD_TITLE_SELECTORS = [
  '.product-card__title',
  '.product-card__name',
  '.product__title',
  'h3',
  'h2',
  'a'
];

const SEARCH_CARD_LINK_SELECTORS = [
  'a[data-product-url]',
  'a[href*="/p/"]',
  'a[href]'
];

const SEARCH_CARD_IMAGE_SELECTORS = [
  'img[data-src]',
  'img[data-original]',
  'img[data-large]',
  'img[src]'
];

const SEARCH_CARD_SKU_ATTRIBUTES = [
  'data-product-sku',
  'data-sku',
  'data-part-number',
  'data-product-id'
];

const SEARCH_CARD_SKU_SELECTORS = [
  '.product-card__sku',
  '.product__sku',
  '.product-card__details',
  '.product-card__meta',
  '.product-card__content'
];

const PART_NUMBER_PATTERN = /[A-Z0-9]{3,10}(?:-[A-Z0-9]{2,8})?/i;

function normalizeSku(value) {
  if (typeof value !== 'string') {
    throw new TypeError('SKU must be a string');
  }

  return normalizePartNumber(value);
}

function resolveLocale(locale) {
  if (typeof locale !== 'string') {
    return DEFAULT_LOCALE;
  }
  const trimmed = locale.trim().replace(/^\/+|\/+$/g, '');
  return trimmed || DEFAULT_LOCALE;
}

function resolveBaseUrl(baseUrl) {
  if (!baseUrl) {
    return DEFAULT_BASE_URL;
  }
  const resolved = new URL(baseUrl, DEFAULT_BASE_URL).toString();
  return resolved.endsWith('/') ? resolved : `${resolved}/`;
}

function extractFirstProductUrlFromDocument($, baseUrl) {
  const preferred = $('.product-card, [data-component="product-card"], [data-sku], [data-product-url]').first();
  let href = null;

  if (preferred && preferred.length > 0) {
    href = preferred.attr('data-product-url')
      || preferred.find('a[href*="/p/"]').first().attr('href')
      || preferred.attr('href');
  }

  if (!href) {
    href = $('a[href*="/p/"]').first().attr('href');
  }

  if (!href) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function buildFetchOptions(options, baseUrl) {
  const fetchOptions = { baseUrl };
  if (typeof options.live === 'boolean') {
    fetchOptions.live = options.live;
  }
  if (typeof options.timeoutMs === 'number') {
    fetchOptions.timeoutMs = options.timeoutMs;
  }
  if (typeof options.retries === 'number') {
    fetchOptions.retries = options.retries;
  }
  if (typeof options.userAgent === 'string') {
    fetchOptions.userAgent = options.userAgent;
  }
  if (Array.isArray(options.userAgents)) {
    fetchOptions.userAgents = options.userAgents;
  }
  if (options.fetch) {
    if (typeof options.fetch === 'function') {
      fetchOptions.fetch = options.fetch;
    } else if (typeof options.fetch === 'object') {
      if (typeof options.fetch.fetch === 'function') {
        fetchOptions.fetch = options.fetch.fetch;
      }
      Object.assign(fetchOptions, options.fetch);
    }
  }
  if (options.logger) {
    fetchOptions.logger = options.logger;
  }
  return fetchOptions;
}

function isNotFoundStatus(status) {
  return status === 404 || status === 410;
}

function isManualCheckStatus(status) {
  return MANUAL_CHECK_STATUSES.has(status ?? null);
}

function normalizeSearchSkuCandidate(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const match = text.match(PART_NUMBER_PATTERN);
  if (!match) {
    return null;
  }

  const candidate = match[0].toUpperCase();
  try {
    return normalizePartNumber(candidate);
  } catch (error) {
    return candidate;
  }
}

function extractCardSku(card) {
  for (const attr of SEARCH_CARD_SKU_ATTRIBUTES) {
    const direct = card.attr(attr);
    const normalized = normalizeSearchSkuCandidate(direct);
    if (normalized) {
      return normalized;
    }

    const nested = card.find(`[${attr}]`).first().attr(attr);
    const nestedNormalized = normalizeSearchSkuCandidate(nested);
    if (nestedNormalized) {
      return nestedNormalized;
    }
  }

  for (const selector of SEARCH_CARD_SKU_SELECTORS) {
    const text = normalizeSearchSkuCandidate(card.find(selector).first().text());
    if (text) {
      return text;
    }
  }

  return normalizeSearchSkuCandidate(card.text());
}

function absolutizeSearchUrl(href, baseUrl) {
  if (!href) {
    return null;
  }

  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol === 'http:') {
      resolved.protocol = 'https:';
    }
    resolved.search = '';
    return resolved.toString();
  } catch (error) {
    return null;
  }
}

function extractCardUrl(card, baseUrl) {
  const direct = absolutizeSearchUrl(card.attr('data-product-url'), baseUrl);
  if (direct) {
    return direct;
  }

  for (const selector of SEARCH_CARD_LINK_SELECTORS) {
    const element = card.is('a') ? card : card.find(selector).first();
    if (!element || element.length === 0) {
      continue;
    }

    const dataUrl = absolutizeSearchUrl(element.attr('data-product-url'), baseUrl);
    if (dataUrl) {
      return dataUrl;
    }

    const href = absolutizeSearchUrl(element.attr('href'), baseUrl);
    if (href) {
      return href;
    }
  }

  return null;
}

function extractCardImage(card, baseUrl) {
  const attributes = ['data-product-image', 'data-image', 'data-src', 'data-original', 'data-large', 'src'];

  for (const attr of attributes) {
    const direct = card.attr(attr);
    const normalized = absolutizeSearchUrl(direct, baseUrl);
    if (normalized) {
      return normalized;
    }

    const nested = card.find(`[${attr}]`).first().attr(attr);
    const nestedNormalized = absolutizeSearchUrl(nested, baseUrl);
    if (nestedNormalized) {
      return nestedNormalized;
    }
  }

  for (const selector of SEARCH_CARD_IMAGE_SELECTORS) {
    const image = card.find(selector).first();
    if (!image || image.length === 0) {
      continue;
    }

    for (const attr of attributes) {
      const value = image.attr(attr);
      const normalized = absolutizeSearchUrl(value, baseUrl);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function extractCardTitle(card) {
  for (const selector of SEARCH_CARD_TITLE_SELECTORS) {
    const element = card.find(selector).first();
    const candidate = sanitizeBuyTitle(element && element.length > 0 ? element.text() : null);
    if (candidate) {
      return candidate;
    }
  }

  return sanitizeBuyTitle(card.text());
}

function collectSearchCards($) {
  const nodes = [];
  const seen = new Set();

  for (const selector of SEARCH_CARD_SELECTORS) {
    $(selector)
      .toArray()
      .forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          nodes.push(element);
        }
      });
  }

  if (nodes.length === 0) {
    $('a[href*="/p/"]')
      .toArray()
      .forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          nodes.push(element);
        }
      });
  }

  return nodes;
}

function extractSearchFallback($, baseUrl, normalizedSku) {
  const target = normalizedSku ? normalizedSku.toUpperCase() : null;
  let fallback = null;

  for (const element of collectSearchCards($)) {
    const card = $(element);
    const title = extractCardTitle(card);
    const url = extractCardUrl(card, baseUrl);
    if (!title || !url) {
      continue;
    }

    const sku = extractCardSku(card);
    const image = extractCardImage(card, baseUrl);
    const candidate = {
      title,
      url,
      image: image || null,
      sku: sku || null,
      partNumber: sku || null
    };

    if (target && sku && sku.toUpperCase() === target) {
      return candidate;
    }

    if (!fallback) {
      fallback = candidate;
    }
  }

  return fallback;
}

async function fetchProduct(urlOrPath, fetchOptions, sku) {
  try {
    const response = await fetchBuyHpe(urlOrPath, {
      ...fetchOptions,
      partNumber: sku,
      provider: 'BUY'
    });
    const html = typeof response.html === 'string' ? response.html : '';
    if (!html.trim()) {
      return null;
    }

    const parsed = parseBuyHpe(html, { url: response.url, sku });
    if (!parsed) {
      return null;
    }
    return { ...parsed, source: 'HPE Buy (buy.hpe.com)' };
  } catch (error) {
    if (isNotFoundStatus(error?.status)) {
      return null;
    }
    throw error;
  }
}

export async function providerBuyHpe(sku, options = {}) {
  const normalizedSku = normalizeSku(sku);
  const locale = resolveLocale(options.locale);
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const fetchOptions = buildFetchOptions(options, baseUrl);
  let productErrorStatus = null;
  let productBlockError = null;

  try {
    const slug = encodeURIComponent(normalizedSku.toLowerCase());
    const productPath = `${locale}/p/${slug}`;
    const product = await fetchProduct(productPath, fetchOptions, normalizedSku);
    if (product) {
      return { ...product, fetchedFrom: 'product' };
    }
  } catch (error) {
    if (isManualCheckStatus(error?.status) || error?.status === 503) {
      productErrorStatus = error?.status ?? null;
      productBlockError = error;
    } else if (!error || (error.status && !isNotFoundStatus(error.status))) {
      throw error;
    }
  }

  const searchPath = `${locale}/search?q=${encodeURIComponent(normalizedSku)}`;
  let searchResponse;

  try {
    searchResponse = await fetchBuyHpe(searchPath, fetchOptions);
  } catch (error) {
    if (isNotFoundStatus(error?.status)) {
      return null;
    }
    throw error;
  }

  const searchHtml = typeof searchResponse.html === 'string' ? searchResponse.html : '';
  if (!searchHtml.trim()) {
    if (productErrorStatus !== null) {
      const error = productBlockError || new Error('Access blocked by buy.hpe.com');
      error.status = productErrorStatus;
      throw error;
    }
    return null;
  }

  const searchBaseUrl = searchResponse.url || baseUrl;
  const $search = load(searchHtml);
  const fallbackCard = extractSearchFallback($search, searchBaseUrl, normalizedSku);
  const productUrl = fallbackCard?.url ?? extractFirstProductUrlFromDocument($search, searchBaseUrl);

  if (productErrorStatus && fallbackCard) {
    const skuCandidate = fallbackCard.sku || normalizedSku;
    return {
      title: fallbackCard.title,
      sku: skuCandidate,
      partNumber: fallbackCard.partNumber || skuCandidate,
      url: fallbackCard.url,
      image: fallbackCard.image || null,
      source: 'HPE Buy (buy.hpe.com)',
      fetchedFrom: 'search-card'
    };
  }

  if (!productUrl) {
    if (productErrorStatus !== null) {
      const error = productBlockError || new Error('Access blocked by buy.hpe.com');
      error.status = productErrorStatus;
      throw error;
    }
    return null;
  }

  try {
    const product = await fetchProduct(productUrl, fetchOptions, normalizedSku);
    if (product) {
      return { ...product, fetchedFrom: fallbackCard ? 'search' : 'search' };
    }
  } catch (error) {
    if (fallbackCard && (isManualCheckStatus(error?.status) || error?.status === 503)) {
      const skuCandidate = fallbackCard.sku || normalizedSku;
      return {
        title: fallbackCard.title,
        sku: skuCandidate,
        partNumber: fallbackCard.partNumber || skuCandidate,
        url: fallbackCard.url,
        image: fallbackCard.image || null,
        source: 'HPE Buy (buy.hpe.com)',
        fetchedFrom: 'search-card'
      };
    }

    if (isNotFoundStatus(error?.status)) {
      return null;
    }

    throw error;
  }

  if (fallbackCard) {
    const skuCandidate = fallbackCard.sku || normalizedSku;
    return {
      title: fallbackCard.title,
      sku: skuCandidate,
      partNumber: fallbackCard.partNumber || skuCandidate,
      url: fallbackCard.url,
      image: fallbackCard.image || null,
      source: 'HPE Buy (buy.hpe.com)',
      fetchedFrom: 'search-card'
    };
  }

  if (productErrorStatus !== null) {
    const error = productBlockError || new Error('Access blocked by buy.hpe.com');
    error.status = productErrorStatus;
    throw error;
  }

  return null;
}

export default providerBuyHpe;
