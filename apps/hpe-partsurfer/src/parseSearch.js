import { load } from 'cheerio';

const DESCRIPTION_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_lblPartDescription',
  '#ctl00_BodyContentPlaceHolder_lblDescription',
  '.ps-part-description',
  'h1.part-description'
];

const BOM_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_gvBom',
  '#ctl00_BodyContentPlaceHolder_lvBom',
  '.ps-bom'
];

const IMAGE_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_imgPart',
  'img.ps-part-image',
  'img#partImage'
];

function extractText($, element) {
  return $(element).text().trim();
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

function detectFallbackDescription($) {
  const candidates = [];

  $('td,th,span,strong,p').each((_, el) => {
    const text = extractText($, el);
    if (!text) {
      return;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (/^description\s*:/i.test(normalized)) {
      const value = normalized.split(/:/, 2)[1];
      if (value) {
        candidates.push(value.trim());
      }
    }
  });

  return candidates.length > 0 ? candidates[0] : null;
}

function detectNoResults($) {
  const bodyText = $('body').text().toLowerCase();
  return bodyText.includes('no results found') || bodyText.includes('did not return any records');
}

function detectBomPresence($) {
  for (const selector of BOM_SELECTORS) {
    if ($(selector).find('tr,li').length > 0) {
      return true;
    }
    if ($(selector).length > 0) {
      const text = extractText($, $(selector));
      if (text) {
        return true;
      }
    }
  }

  const bodyText = $('body').text().toLowerCase();
  if (bodyText.includes('bill of materials is not available')) {
    return false;
  }

  return false;
}

function extractImageUrl($) {
  for (const selector of IMAGE_SELECTORS) {
    const element = $(selector).first();
    if (element && element.length > 0) {
      const src = element.attr('src');
      if (src && src.trim()) {
        return src.trim();
      }
    }
  }

  return null;
}

export function parseSearch(html) {
  if (!html) {
    return { description: null, bomPresent: false, imageUrl: null };
  }

  const $ = load(html);

  if (detectNoResults($)) {
    return { description: null, bomPresent: false, imageUrl: null };
  }

  const directDescription = findFirstText($, DESCRIPTION_SELECTORS);
  const fallbackDescription = directDescription || detectFallbackDescription($);
  const bomPresent = detectBomPresence($);
  const imageUrl = extractImageUrl($);

  return {
    description: fallbackDescription,
    bomPresent,
    imageUrl
  };
}
