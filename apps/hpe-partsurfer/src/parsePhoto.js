import { load } from 'cheerio';
import { absolutizeUrl, normalizeWhitespace } from './html.js';

const DESCRIPTION_SELECTORS = [
  '#ctl00_mainContent_lblShortDescription',
  '#ctl00_BodyContentPlaceHolder_lblShortDescription',
  '#ctl00_BodyContentPlaceHolder_lblDescription',
  '.ps-photo-description',
  '.ps-photo-details__description',
  '.ps-part-summary__title',
  '.photo-description',
  '.photo-card__description',
  '.ps-photo-caption',
  'h1',
  'h2.short-description',
  'meta[property="og:description"]',
  'meta[name="description"]'
];

const CAPTION_SELECTORS = ['figcaption', '.ps-photo-caption', '.photo-caption', '.caption'];
const CAPTION_SELECTOR_STRING = CAPTION_SELECTORS.join(',');

const IMAGE_SELECTORS = [
  '#ctl00_mainContent_imgPhoto',
  '#ctl00_BodyContentPlaceHolder_imgPhoto',
  '.ps-photo-image img',
  '.ps-photo img',
  '.photo-card__image img',
  '.photo-container img',
  'img[data-large]',
  'img[data-original]',
  'img[data-src]',
  'meta[property="og:image"]'
];

const IMAGE_ATTRIBUTE_CANDIDATES = ['data-large', 'data-original', 'data-src', 'data-full', 'data-zoom-image', 'src', 'content'];

const NO_PHOTO_PATTERNS = [
  /no photo available/i,
  /photo is not available/i,
  /unable to display/i,
  /image temporarily unavailable/i,
  /we are unable to find an image/i
];

function extractText($, element) {
  if (!element || element.length === 0) {
    return '';
  }

  const nodeName = element.get(0)?.name?.toLowerCase();
  if (nodeName === 'meta') {
    return normalizeWhitespace(element.attr('content'));
  }

  return normalizeWhitespace(element.text());
}

function findFirstText($, selectors) {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element && element.length > 0) {
      const text = extractText($, element);
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function extractImage($) {
  for (const selector of IMAGE_SELECTORS) {
    const element = $(selector).first();
    if (!element || element.length === 0) {
      continue;
    }

    for (const attribute of IMAGE_ATTRIBUTE_CANDIDATES) {
      const value = element.attr(attribute);
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!normalized) {
        continue;
      }

      const absolute = absolutizeUrl(normalized);
      if (absolute) {
        const resolvedElement = element.is('meta') ? null : element;
        return { url: absolute, element: resolvedElement };
      }
    }
  }

  const link = $('a[href*=".jpg"], a[href*=".png"], a[href*="/ShowPhoto.aspx"]').first();
  if (link && link.length > 0) {
    const href = link.attr('href');
    const absolute = absolutizeUrl(href);
    if (absolute) {
      return { url: absolute, element: link };
    }
  }

  return { url: null, element: null };
}

function extractCaption($, imageElement) {
  if (!imageElement || imageElement.length === 0) {
    return null;
  }

  const figure = imageElement.closest('figure');
  if (figure && figure.length > 0) {
    const caption = figure.find(CAPTION_SELECTOR_STRING).first();
    const text = extractText($, caption);
    if (text) {
      return text;
    }
  }

  const parentCaption = imageElement.parent().find(CAPTION_SELECTOR_STRING).first();
  if (parentCaption && parentCaption.length > 0) {
    const text = extractText($, parentCaption);
    if (text) {
      return text;
    }
  }

  return null;
}

function findFallbackDescription($) {
  const labeled = $('body')
    .find('p, span, div, strong')
    .filter((_, el) => /^description\s*:/i.test(normalizeWhitespace($(el).text())))
    .first();

  if (labeled && labeled.length > 0) {
    const text = normalizeWhitespace(labeled.text());
    const match = text.match(/^description\s*:\s*(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function isNotFound($) {
  const bodyText = normalizeWhitespace($('body').text());
  return NO_PHOTO_PATTERNS.some((pattern) => pattern.test(bodyText));
}

export function parsePhoto(html) {
  if (!html) {
    return { description: null, imageUrl: null };
  }

  const $ = load(html);

  if (isNotFound($)) {
    return { description: null, imageUrl: null };
  }

  const directDescription = findFirstText($, DESCRIPTION_SELECTORS);
  const image = extractImage($);
  const caption = image.element ? extractCaption($, image.element) : null;
  const fallbackDescription = findFallbackDescription($);

  const description = directDescription || caption || fallbackDescription || null;

  return {
    description,
    imageUrl: image.url
  };
}
