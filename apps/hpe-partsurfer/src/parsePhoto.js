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

const PART_DESCRIPTION_PATTERN = /part description\s*[:：]\s*(.+)/i;
const NOT_AVAILABLE_PATTERN = /product description not available/i;

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

function sanitizeTitle(value, context) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  if (NOT_AVAILABLE_PATTERN.test(text)) {
    if (context) {
      context.descriptionUnavailable = true;
    }
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

function pickLongestMeaningful(candidates) {
  return candidates.reduce((longest, current) => {
    if (!current) {
      return longest;
    }

    if (!longest || current.length > longest.length) {
      return current;
    }

    return longest;
  }, null);
}

function extractCaption($, imageElement, context) {
  if (!imageElement || imageElement.length === 0) {
    return null;
  }

  const containers = [];
  const figure = imageElement.closest('figure');
  if (figure && figure.length > 0) {
    containers.push(figure);
  }

  const parent = imageElement.parent();
  if (parent && parent.length > 0) {
    containers.push(parent);
  }

  const candidates = [];
  for (const container of containers) {
    container.find(CAPTION_SELECTOR_STRING).each((_, element) => {
      const text = sanitizeTitle(extractText($, $(element)), context);
      if (text) {
        candidates.push(text);
      }
    });
  }

  return pickLongestMeaningful(candidates);
}

function isNotFound($) {
  const bodyText = collapseWhitespace($('body').text());
  return NO_PHOTO_PATTERNS.some((pattern) => pattern.test(bodyText));
}

function extractNearbyTitle($, imageElement, context) {
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

    const candidates = [];
    container.find(NEARBY_SELECTOR_STRING).each((_, element) => {
      const text = sanitizeTitle(extractText($, $(element)), context);
      if (text) {
        candidates.push(text);
      }
      return undefined;
    });

    const longest = pickLongestMeaningful(candidates);
    if (longest) {
      return longest;
    }
  }

  return null;
}

function extractAltText(imageElement, context) {
  if (!imageElement || imageElement.length === 0) {
    return null;
  }

  const alt = imageElement.attr('alt');
  if (typeof alt !== 'string') {
    return null;
  }

  return sanitizeTitle(alt, context);
}

function extractDescriptionFromBody($, context) {
  const body = $('body').text();
  if (!body) {
    return null;
  }

  const lines = body.split(/\r?\n|\r/);
  for (const line of lines) {
    const normalized = collapseWhitespace(line);
    if (NOT_AVAILABLE_PATTERN.test(normalized)) {
      continue;
    }
    const match = normalized.match(PART_DESCRIPTION_PATTERN);
    if (match && match[1]) {
      const candidate = sanitizeTitle(match[1], context);
      if (candidate) {
        return candidate;
      }
    }
  }

  const collapsed = collapseWhitespace(body);
  if (NOT_AVAILABLE_PATTERN.test(collapsed)) {
    return null;
  }
  const inlineMatch = collapsed.match(PART_DESCRIPTION_PATTERN);
  if (inlineMatch && inlineMatch[1]) {
    const candidate = sanitizeTitle(inlineMatch[1], context);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function parsePhoto(html) {
  if (!html) {
    return { title: null, imageUrl: null, notFound: true, manualCheck: false };
  }

  const $ = load(html);

  if (isNotFound($)) {
    return { title: null, imageUrl: null, notFound: true, manualCheck: false };
  }

  const bodyText = $('body').text() ?? '';
  const context = { descriptionUnavailable: NOT_AVAILABLE_PATTERN.test(bodyText) };
  const headTitle = sanitizeTitle($('head > title').first().text(), context) || null;
  const image = extractImage($);
  const caption = image.element ? extractCaption($, image.element, context) : null;
  const nearbyTitle = image.element ? extractNearbyTitle($, image.element, context) : null;
  const bodyTitle = extractDescriptionFromBody($, context);

  const globalCandidates = [];
  if (!caption || !nearbyTitle) {
    $(NEARBY_SELECTOR_STRING).each((_, element) => {
      const text = sanitizeTitle(extractText($, $(element)), context);
      if (text) {
        globalCandidates.push(text);
      }
      return undefined;
    });
  }

  const globalTitle = pickLongestMeaningful(globalCandidates);
  const altText = context.descriptionUnavailable ? null : extractAltText(image.element || $('img').first(), context);

  const title = bodyTitle
    || caption
    || nearbyTitle
    || globalTitle
    || headTitle
    || altText
    || null;

  const imageUrl = image.url;
  const manualCheck = context.descriptionUnavailable === true;
  const notFound = manualCheck || (!title && !imageUrl);

  return {
    title,
    imageUrl,
    notFound,
    manualCheck
  };
}
