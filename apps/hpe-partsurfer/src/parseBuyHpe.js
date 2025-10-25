import { load } from 'cheerio';
import { normalizeWhitespace } from './html.js';

const SCHEMA_PRODUCT = 'product';
const SCHEMA_OFFER = 'offer';

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

function normalizeAvailability(value) {
  const text = coerceString(value);
  if (!text) {
    return null;
  }
  const lowered = text.toLowerCase();
  if (lowered.includes('instock') || lowered.includes('in_stock') || lowered.includes('in stock')) {
    return 'InStock';
  }
  if (lowered.includes('outofstock') || lowered.includes('out_of_stock') || lowered.includes('out of stock')) {
    return 'OutOfStock';
  }
  if (lowered.includes('preorder')) {
    return 'PreOrder';
  }
  if (lowered.startsWith('http')) {
    const tail = lowered.split('/').pop();
    if (tail) {
      const clean = tail.replace(/[^a-z]/g, '');
      if (clean) {
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }
    return text.trim();
  }
  return text.trim();
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
        const url = coerceString(node.url) || baseUrl;
        const sku = coerceString(node.sku) || pickProductIdentifier(node);
        const partNumber = pickProductIdentifier(node) || sku;
        return {
          title: coerceString(node.name) || coerceString(node.title),
          price: coerceString(offer?.price),
          priceCurrency: coerceString(offer?.priceCurrency) || coerceString(node.priceCurrency),
          availability: normalizeAvailability(offer?.availability ?? node.availability),
          sku: sku || null,
          partNumber: partNumber || null,
          url: absolutize(url, baseUrl),
          image: absolutize(coerceString(node.image), baseUrl),
          category: coerceString(node.category) || coerceString(node.categoryName)
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

function extractAvailability($) {
  const selectors = ['.availability', '[data-availability]', '[itemprop="availability"]'];
  for (const selector of selectors) {
    const element = $(selector).first();
    if (!element || element.length === 0) {
      continue;
    }
    const attr = element.attr('data-availability');
    const text = normalizeWhitespace(attr || element.text());
    if (text) {
      return normalizeAvailability(text);
    }
  }
  return null;
}

function extractTitle($) {
  const productHeading = normalizeWhitespace($('h1.product-detail__name').first().text());
  if (productHeading) {
    return productHeading;
  }

  const testIdHeading = normalizeWhitespace($('[data-testid="pdp_productTitle"]').first().text());
  if (testIdHeading) {
    return testIdHeading;
  }

  const ogTitle = textFromMeta($, 'og:title');
  if (ogTitle) {
    return ogTitle;
  }

  const twitterTitle = textFromMeta($, 'twitter:title');
  if (twitterTitle) {
    return twitterTitle;
  }

  const genericHeading = normalizeWhitespace($('h1').first().text());
  if (genericHeading) {
    return genericHeading;
  }

  const documentTitle = normalizeWhitespace($('title').first().text());
  return documentTitle || null;
}

function extractImage($, baseUrl) {
  const inlineSelectors = [
    'img[data-product-image]',
    '.product-image img',
    'article img',
    'img[loading]'
  ];
  for (const selector of inlineSelectors) {
    const element = $(selector).first();
    if (element && element.length) {
      const src = element.attr('src');
      if (src) {
        const absolute = absolutize(src, baseUrl);
        if (absolute) {
          return absolute;
        }
      }
    }
  }
  const og = textFromMeta($, 'og:image');
  if (og) {
    return absolutize(og, baseUrl);
  }
  return null;
}

function extractPrice($) {
  const attrSelectors = [
    ['[data-price]', 'data-price'],
    ['[data-price-amount]', 'data-price-amount'],
    ['meta[itemprop="price"]', 'content']
  ];
  for (const [selector, attribute] of attrSelectors) {
    const element = $(selector).first();
    if (element && element.length) {
      const value = element.attr(attribute);
      if (value) {
        return normalizeWhitespace(value.replace(/[^0-9.,-]/g, ''));
      }
    }
  }
  const textSelectors = ['.price', '.price-value', '.product-price'];
  for (const selector of textSelectors) {
    const element = $(selector).first();
    if (element && element.length) {
      const value = normalizeWhitespace(element.text());
      if (value) {
        const numeric = value.replace(/[^0-9.,-]/g, '');
        if (numeric) {
          return numeric;
        }
      }
    }
  }
  return null;
}

function extractCurrency($) {
  const attrSelectors = [
    ['meta[itemprop="priceCurrency"]', 'content'],
    ['[data-price-currency]', 'data-price-currency'],
    ['[data-currency]', 'data-currency']
  ];
  for (const [selector, attribute] of attrSelectors) {
    const element = $(selector).first();
    if (element && element.length) {
      const value = normalizeWhitespace(element.attr(attribute));
      if (value) {
        return value.toUpperCase();
      }
    }
  }
  return null;
}

function extractIdentifier($) {
  const identifierSelectors = [
    ['[data-sku]', 'data-sku'],
    ['[data-product-id]', 'data-product-id'],
    ['[data-part-number]', 'data-part-number'],
    ['meta[name="sku"]', 'content'],
    ['meta[itemprop="sku"]', 'content']
  ];
  for (const [selector, attr] of identifierSelectors) {
    const element = $(selector).first();
    if (element && element.length) {
      const value = normalizeWhitespace(element.attr(attr));
      if (value) {
        return value;
      }
    }
  }
  const h1 = normalizeWhitespace($('h1').first().text());
  if (h1) {
    const match = h1.match(/\b([A-Z0-9]{3,}-?[A-Z0-9]{0,})\b/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function parseFallback($, baseUrl) {
  const title = extractTitle($);
  const image = extractImage($, baseUrl);
  const canonical = $('link[rel="canonical"]').attr('href') || textFromMeta($, 'og:url');
  const price = extractPrice($);
  const currency = extractCurrency($);
  const availability = extractAvailability($);
  const identifier = extractIdentifier($);
  const category = textFromMeta($, 'product:category') || textFromMeta($, 'og:category') || findFirstBreadcrumb($);

  if (!title) {
    return null;
  }

  return {
    title: title || null,
    price: price || null,
    priceCurrency: currency || null,
    availability: availability || null,
    sku: identifier || null,
    partNumber: identifier || null,
    url: absolutize(canonical || baseUrl, baseUrl),
    image: image,
    category: category || null
  };
}

export function parseBuyHpe(html, options = {}) {
  if (typeof html !== 'string') {
    throw new TypeError('html must be a string');
  }
  const trimmed = html.trim();
  if (!trimmed) {
    return null;
  }
  let baseUrl = 'https://buy.hpe.com/';
  if (typeof options.baseUrl === 'string' && options.baseUrl) {
    baseUrl = options.baseUrl;
  } else if (typeof options.url === 'string' && options.url) {
    try {
      const parsed = new URL(options.url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        baseUrl = parsed.toString();
      }
    } catch (error) {
      // ignore invalid URLs and fall back to default base
    }
  }
  const $ = load(html);

  const fromJsonLd = parseJsonLd($, baseUrl);
  if (fromJsonLd) {
    return fromJsonLd;
  }

  return parseFallback($, baseUrl);
}

export default parseBuyHpe;
