import { load } from 'cheerio';

const DESCRIPTION_SELECTORS = [
  '#ctl00_mainContent_lblShortDescription',
  '#ctl00_BodyContentPlaceHolder_lblShortDescription',
  '.ps-photo-description',
  'h2.short-description'
];

const IMAGE_SELECTORS = [
  '#ctl00_mainContent_imgPhoto',
  '#ctl00_BodyContentPlaceHolder_imgPhoto',
  'img.ps-photo-image'
];

function findText($, selectors) {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element && element.length > 0) {
      const text = element.text().trim();
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function findImageUrl($, selectors) {
  for (const selector of selectors) {
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

function isNotFound($) {
  const bodyText = $('body').text().toLowerCase();
  return bodyText.includes('no photo available') || bodyText.includes('unable to display the selected part');
}

export function parsePhoto(html) {
  if (!html) {
    return { description: null, imageUrl: null };
  }

  const $ = load(html);

  if (isNotFound($)) {
    return { description: null, imageUrl: null };
  }

  const description = findText($, DESCRIPTION_SELECTORS);
  const imageUrl = findImageUrl($, IMAGE_SELECTORS);

  return {
    description,
    imageUrl
  };
}
