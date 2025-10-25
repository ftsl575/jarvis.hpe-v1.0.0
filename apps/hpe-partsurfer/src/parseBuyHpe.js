import { load } from 'cheerio';
import { normalizeWhitespace } from './html.js';
import { normalizeUrl } from './normalize.js';

const SCHEMA_PRODUCT = 'product';
const SCHEMA_OFFER = 'offer';
const DEFAULT_BASE_URL = 'https://buy.hpe.com/';

const TITLE_SELECTORS = [
  'h1.product-detail__name',
  'h1.pdp-product-name',
  '.product-detail__summary h1',
  '.product__title',
  '[data-testid="pdp_productTitle"]'
];

const META_TITLE_SELECTORS = [
  ['meta[property="og:title"]', 'content'],
  ['meta[name="twitter:title"]', 'content']
];

const SKU_ATTRIBUTE_SELECTORS = [
  ['[data-product-sku]', 'data-product-sku'],
  ['[data-sku]', 'data-sku'],
  ['[data-product-id]', 'data-product-id'],
  ['[data-part-number]', 'data-part-number'],
  ['meta[name="sku"]', 'content'],
  ['meta[itemprop="sku"]', 'content'],
  ['[itemprop="sku"]', 'content']
];

function isSchemaTypeMatch(value, expected) {
  if (!value) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => isSchemaTypeMatch(entry, expected));
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === expected.toLowerCase();
  }
  return false;
}

function* iterateNodes(node) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      yield* iterateNodes(entry);
    }
    return;
  }
  yield node;
  if (Array.isArray(node['@graph'])) {
    for (const entry of node['@graph']) {
      yield* iterateNodes(entry);
    }
  }
}

function coerceString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = coerceString(entry);
      if (result) {
        return result;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    if (value['@value']) {
      return coerceString(value['@value']);
    }
    return null;
  }
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function pickProductIdentifier(product) {
  const candidates = [
    product.sku,
    product.productID,
    product.productId,
    product.mpn,
    product.partNumber,
    product['@id']
  ];
  for (const candidate of candidates) {
    const value = coerceString(candidate);
    if (value) {
      return value;
    }
  }
  return null;
}

function pickOffer(offers) {
  if (!offers) {
    return null;
  }
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (offer && typeof offer === 'object' && isSchemaTypeMatch(offer['@type'], SCHEMA_OFFER)) {
        return offer;
      }
    }
    return pickOffer(offers[0]);
  }
  if (offers && typeof offers === 'object') {
    if (Array.isArray(offers.offers)) {
      return pickOffer(offers.offers);
    }
    return offers;
  }
  return null;
}

function absolutize(url, baseUrl) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function parseJsonLd($, baseUrl) {
  const scripts = $('script[type="application/ld+json"]');
  for (const element of scripts.toArray()) {
    const raw = $(element).contents().text();
    if (!raw) {
      continue;
    }
    try {
      const json = JSON.parse(raw);
      for (const node of iterateNodes(json)) {
        if (!node || typeof node !== 'object') {
          continue;
        }
        if (!isSchemaTypeMatch(node['@type'], SCHEMA_PRODUCT)) {
          continue;
        }
        const offer = pickOffer(node.offers ?? node.offer);
        const sku = coerceString(node.sku) || pickProductIdentifier(node);
        const partNumber = pickProductIdentifier(node) || sku;
        return {
          title: coerceString(node.name) || coerceString(node.title) || null,
          sku: sku || null,
          partNumber: partNumber || null,
          url: absolutize(coerceString(node.url), baseUrl),
          image: absolutize(coerceString(node.image), baseUrl),
          category: coerceString(node.category) || coerceString(node.categoryName) || coerceString(offer?.category) || null
        };
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

function textFromMeta($, name) {
  const meta = $(`meta[name="${name}"]`).attr('content') || $(`meta[property="${name}"]`).attr('content');
  return meta ? normalizeWhitespace(meta) : null;
}

function findFirstBreadcrumb($) {
  const items = [];
  $('[aria-label="Breadcrumb"], nav.breadcrumb, ol.breadcrumb, ul.breadcrumb').first().find('a, span').each((_, el) => {
    const value = normalizeWhitespace($(el).text());
    if (value) {
      items.push(value);
    }
  });
  return items.length > 0 ? items.join(' > ') : null;
}

function findTitle($) {
  for (const selector of TITLE_SELECTORS) {
    const text = normalizeWhitespace($(selector).first().text());
    if (text) {
      return text;
    }
  }
  for (const [selector, attribute] of META_TITLE_SELECTORS) {
    const value = $(selector).attr(attribute);
    if (typeof value === 'string' && value.trim()) {
      const text = normalizeWhitespace(value);
      if (text) {
        return text;
      }
    }
  }
  return null;
}

function extractSkuFromDom($) {
  for (const [selector, attr] of SKU_ATTRIBUTE_SELECTORS) {
    const element = $(selector).first();
    if (!element || element.length === 0) {
      continue;
    }
    const value = attr === 'content' ? element.attr(attr) : element.attr(attr) ?? element.text();
    const normalized = normalizeWhitespace(value ?? '');
    if (normalized) {
      return normalized;
    }
  }
  const inlineSku = normalizeWhitespace($('[itemprop="sku"]').first().text());
  if (inlineSku) {
    return inlineSku;
  }
  return null;
}

function extractImage($, baseUrl) {
  const inlineSelectors = [
    'img[data-product-image]',
    '.product-detail__gallery img',
    '.product-image img',
    'article img',
    'img[loading]'
  ];
  for (const selector of inlineSelectors) {
    const element = $(selector).first();
    if (!element || element.length === 0) {
      continue;
    }
    const src = element.attr('src');
    if (src) {
      const absolute = absolutize(src, baseUrl);
      if (absolute) {
        return absolute;
      }
    }
  }
  const og = textFromMeta($, 'og:image');
  if (og) {
    return absolutize(og, baseUrl);
  }
  return null;
}

function resolveBaseUrl(options) {
  if (options && typeof options.baseUrl === 'string' && options.baseUrl) {
    try {
      return new URL(options.baseUrl, DEFAULT_BASE_URL).toString();
    } catch (error) {
      return DEFAULT_BASE_URL;
    }
  }
  if (options && typeof options.url === 'string' && options.url) {
    try {
      const parsed = new URL(options.url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        parsed.pathname = '/';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
      }
    } catch (error) {
      return DEFAULT_BASE_URL;
    }
  }
  return DEFAULT_BASE_URL;
}

function resolveCanonicalUrl($, baseUrl, fallback) {
  const canonical = $('link[rel="canonical"]').attr('href') || textFromMeta($, 'og:url') || fallback;
  if (!canonical) {
    return null;
  }
  const absolute = absolutize(canonical, baseUrl) || canonical;
  return normalizeUrl(absolute) || absolute;
}

export function parseBuyHpe(html, options = {}) {
  if (typeof html !== 'string') {
    throw new TypeError('html must be a string');
  }
  const trimmed = html.trim();
  if (!trimmed) {
    return null;
  }

  const baseUrl = resolveBaseUrl(options);
  const $ = load(html);
  const structured = parseJsonLd($, baseUrl) || null;
  const title = findTitle($) || structured?.title || null;
  if (!title) {
    return null;
  }

  const sku = structured?.sku || extractSkuFromDom($) || null;
  const partNumber = structured?.partNumber || sku || null;
  const fallbackUrl = typeof options.url === 'string' ? options.url : null;
  const url = resolveCanonicalUrl($, baseUrl, structured?.url || fallbackUrl);
  const image = structured?.image || extractImage($, baseUrl) || null;
  const category = structured?.category || textFromMeta($, 'product:category') || textFromMeta($, 'og:category') || findFirstBreadcrumb($) || null;

  return {
    title,
    sku,
    partNumber,
    url,
    image,
    category
  };
}

export default parseBuyHpe;
