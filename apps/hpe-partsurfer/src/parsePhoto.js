import { load } from 'cheerio';
import { absolutizeUrl, collapseWhitespace, normalizeText } from './normalize.js';

const CAPTION_SELECTORS = ['figcaption', '.ps-photo-caption', '.photo-caption', '.caption'];
const CAPTION_SELECTOR_STRING = CAPTION_SELECTORS.join(',');

const NEARBY_TITLE_SELECTORS = [
  'h1',
  'h2',
  'h3',
  '.ps-photo-caption',
  '.photo-caption',
  '.caption',
  '.ps-photo-description',
  '.ps-photo-details__description',
  '.photo-description',
  '.photo-card__description',
  'p'
];

const NEARBY_SELECTOR_STRING = NEARBY_TITLE_SELECTORS.join(',');

const GENERIC_TITLE_PATTERNS = [
  /^hpe\s+partsurfer(?:\s*(?:[-–—]\s*)?(?:photo|image))?$/i,
  /^partsurfer(?:\s+photo)?$/i,
  /^photo\s*(?:viewer|details)?$/i
];

const IMAGE_SELECTORS = [
  '#ctl00_mainContent_imgPhoto',
  '#ctl00_BodyContentPlaceHolder_imgPhoto',
  '.ps-photo-image img',
  '.ps-photo img',
  '.photo-card__image img',
  '.photo-container img',
  'figure img',
  'img[src]',
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

function isPlaceholderUrl(url) {
  if (!url) {
    return true;
  }

  return /imagenotfound|placeholder|noimage/i.test(url);
}

function extractText($, element) {
  if (!element || element.length === 0) {
    return '';
  }

  const nodeName = element.get(0)?.name?.toLowerCase();
  if (nodeName === 'meta') {
    return normalizeText(element.attr('content'));
  }

  return normalizeText(element.text());
}

function sanitizeTitle(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  if (GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(text))) {
    return null;
  }

  if (text.length < 3) {
    return null;
  }

  return text;
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
      if (absolute && !isPlaceholderUrl(absolute)) {
        const resolvedElement = element.is('meta') ? null : element;
        return { url: absolute, element: resolvedElement };
      }
    }
  }

  const link = $('a[href*=".jpg"], a[href*=".png"], a[href*="/ShowPhoto.aspx"]').first();
  if (link && link.length > 0) {
    const href = link.attr('href');
    const absolute = absolutizeUrl(href);
    if (absolute && !isPlaceholderUrl(absolute)) {
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
    const text = sanitizeTitle(extractText($, caption));
    if (text) {
      return text;
    }
  }

  const parentCaption = imageElement.parent().find(CAPTION_SELECTOR_STRING).first();
  if (parentCaption && parentCaption.length > 0) {
    const text = sanitizeTitle(extractText($, parentCaption));
    if (text) {
      return text;
    }
  }

  return null;
}

function isNotFound($) {
  const bodyText = collapseWhitespace($('body').text());
  return NO_PHOTO_PATTERNS.some((pattern) => pattern.test(bodyText));
}

function extractNearbyTitle($, imageElement) {
  if (!imageElement || imageElement.length === 0) {
    return null;
  }

  const containers = [
    imageElement.closest('figure'),
    imageElement.closest('.ps-photo, .ps-photo-details, .ps-photo-container, .photo-card, .photo-wrapper, .photo-section'),
    imageElement.parent()
  ];

  for (const container of containers) {
    if (!container || container.length === 0) {
      continue;
    }

    let result = null;
    container.find(NEARBY_SELECTOR_STRING).each((_, element) => {
      const text = sanitizeTitle(extractText($, $(element)));
      if (text) {
        result = text;
        return false;
      }
      return undefined;
    });

    if (result) {
      return result;
    }
  }

  return null;
}

function extractAltText(imageElement) {
  if (!imageElement || imageElement.length === 0) {
    return null;
  }

  const alt = imageElement.attr('alt');
  if (typeof alt !== 'string') {
    return null;
  }

  return sanitizeTitle(alt);
}

export function parsePhoto(html) {
  if (!html) {
    return { title: null, imageUrl: null };
  }

  const $ = load(html);

  if (isNotFound($)) {
    return { title: null, imageUrl: null };
  }

  const headTitle = sanitizeTitle($('head > title').first().text()) || null;
  const image = extractImage($);
  const caption = image.element ? extractCaption($, image.element) : null;
  const nearbyTitle = image.element ? extractNearbyTitle($, image.element) : null;
  let globalTitle = null;

  if (!caption && !nearbyTitle) {
    const elements = $(NEARBY_SELECTOR_STRING).toArray();
    for (const element of elements) {
      const text = sanitizeTitle(extractText($, $(element)));
      if (text) {
        globalTitle = text;
        break;
      }
    }
  }

  const altText = extractAltText(image.element || $('img').first());

  const title = headTitle || caption || nearbyTitle || globalTitle || altText || null;

  return {
    title,
    imageUrl: image.url
  };
}
