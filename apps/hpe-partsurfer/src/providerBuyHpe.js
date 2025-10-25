import { load } from 'cheerio';
import fetchBuyHpe from './fetchBuyHpe.js';
import { parseBuyHpe } from './parseBuyHpe.js';
import { normalizePartNumber } from './normalize.js';

const DEFAULT_BASE_URL = 'https://buy.hpe.com/';
const DEFAULT_LOCALE = 'us/en';

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

function extractFirstProductUrl(html, baseUrl) {
  const $ = load(html);
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
  return status === 403 || status === 404 || status === 410;
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

  try {
    const slug = encodeURIComponent(normalizedSku.toLowerCase());
    const productPath = `${locale}/p/${slug}`;
    const product = await fetchProduct(productPath, fetchOptions, normalizedSku);
    if (product) {
      return { ...product, fetchedFrom: 'product' };
    }
  } catch (error) {
    if (!error || (error.status && !isNotFoundStatus(error.status))) {
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
    return null;
  }

  const productUrl = extractFirstProductUrl(searchHtml, searchResponse.url || baseUrl);
  if (!productUrl) {
    return null;
  }

  const product = await fetchProduct(productUrl, fetchOptions, normalizedSku);
  if (!product) {
    return null;
  }

  return { ...product, fetchedFrom: 'search' };
}

export default providerBuyHpe;
