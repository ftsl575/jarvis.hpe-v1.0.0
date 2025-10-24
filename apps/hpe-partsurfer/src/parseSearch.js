import { load } from 'cheerio';
import { absolutizeUrl, normalizeWhitespace } from './html.js';

const DESCRIPTION_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_lblPartDescription',
  '#ctl00_BodyContentPlaceHolder_lblDescription',
  '#ctl00_BodyContentPlaceHolder_lblItemDescription',
  '.ps-part-summary__title',
  '.ps-part-summary h1',
  '.ps-search-result__title',
  '.result-title',
  'h1.part-description',
  'h1.ps-title',
  'meta[property="og:title"]',
  'meta[name="description"]'
];

const CATEGORY_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_lblCategory',
  '#ctl00_BodyContentPlaceHolder_lblProductCategory',
  '#ctl00_BodyContentPlaceHolder_lblProductLine',
  '.ps-part-summary__category',
  '.ps-part-summary__meta',
  '.ps-part-summary__meta-value',
  '.ps-part-summary__subtitle',
  '.ps-part-meta__category',
  '.ps-field-category',
  'meta[name="product:category"]',
  'meta[property="og:category"]'
];

const BOM_CONTAINER_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_gvBom',
  '#ctl00_BodyContentPlaceHolder_lvBom',
  '#ctl00_BodyContentPlaceHolder_upBom',
  '.ps-bom',
  '.ps-bom-table',
  '.bom-table',
  '[data-component="bom"]',
  '[data-component*="bom"]',
  'div[id*="Bom"]',
  'section[id*="Bom"]',
  'table[id*="Bom"]',
  'div[class*="bom"]',
  'section[class*="bom"]',
  'table[class*="bom"]',
  'ul[class*="bom"]'
];

const IMAGE_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_imgPart',
  '.ps-part-summary__image img',
  '.ps-part-summary img',
  '.ps-search-result img',
  'img.ps-part-image',
  'img#partImage',
  'meta[property="og:image"]'
];

const NO_RESULTS_PATTERNS = [
  /no results/i,
  /did not return any records/i,
  /no matches/i,
  /could not find/i,
  /unable to locate/i,
  /not found/i
];

const BOM_NEGATIVE_PATTERNS = [
  /bill of material is not available/i,
  /bill of materials? not available/i,
  /bom is not available/i,
  /no bill of material/i,
  /this product has no options/i,
  /no options are associated/i
];

const IMAGE_ATTRIBUTE_CANDIDATES = ['data-large', 'data-original', 'data-src', 'src', 'content'];

function stripCategoryLabel(value) {
  if (!value) {
    return '';
  }

  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/category\s*(?:[:\-]|is)?\s*(.+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return normalized;
}

function extractText($, element) {
  if (!element || element.length === 0) {
    return '';
  }

  const nodeName = element.get(0)?.name?.toLowerCase();
  if (nodeName === 'meta') {
    return normalizeWhitespace(element.attr('content'));
  }

  if (nodeName === 'input') {
    return normalizeWhitespace(element.attr('value'));
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

function findDescriptionFromTable($) {
  const tables = $('table').toArray();
  for (const tableElement of tables) {
    const table = $(tableElement);
    const id = table.attr('id') ?? '';
    const className = table.attr('class') ?? '';
    if (/(\bbom\b|bill\s*of\s*material)/i.test(`${id} ${className}`)) {
      continue;
    }

    let headers = table.find('thead th').toArray();
    if (headers.length === 0) {
      headers = table.find('tr').first().find('th').toArray();
    }

    if (headers.length === 0) {
      continue;
    }

    let descriptionIndex = -1;
    headers.forEach((header, index) => {
      const headerText = normalizeWhitespace($(header).text());
      if (descriptionIndex === -1 && /description/i.test(headerText)) {
        descriptionIndex = index;
      }
    });

    if (descriptionIndex === -1) {
      continue;
    }

    let dataRows = table.find('tbody tr').toArray();
    if (dataRows.length === 0) {
      dataRows = table.find('tr').slice(1).toArray();
    }

    for (const row of dataRows) {
      const cells = $(row).find('td').toArray();
      if (cells.length === 0 || descriptionIndex >= cells.length) {
        continue;
      }

      const candidate = normalizeWhitespace($(cells[descriptionIndex]).text());
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function findDescriptionFromPairs($) {
  const containerSelectors = [
    '.ps-field',
    '.ps-part-summary__detail',
    '.part-summary__row',
    '.field-row',
    '.ps-attribute',
    '.ps-detail-row',
    '.ps-part-attribute'
  ];

  for (const selector of containerSelectors) {
    const container = $(selector);
    if (!container || container.length === 0) {
      continue;
    }

    let result = null;
    container.each((_, element) => {
      const wrapper = $(element);
      const label = wrapper.find('.ps-field-label, .field-label, .ps-label, .label, .heading, .ps-part-attribute__label').first();
      const value = wrapper.find('.ps-field-value, .field-value, .ps-value, .value, .content, .ps-part-attribute__value, .ps-field-text').first();
      const labelText = normalizeWhitespace(label.text());
      if (/description/i.test(labelText)) {
        const valueText = normalizeWhitespace(value.text());
        if (valueText) {
          result = valueText;
          return false;
        }
      }

      return undefined;
    });

    if (result) {
      return result;
    }
  }

  const dt = $('dt').filter((_, el) => /description/i.test(normalizeWhitespace($(el).text()))).first();
  if (dt && dt.length > 0) {
    const dd = dt.nextAll('dd').filter((_, el) => normalizeWhitespace($(el).text()).length > 0).first();
    const value = normalizeWhitespace(dd.text());
    if (value) {
      return value;
    }
  }

  const labelElement = $('span, strong, label, div, th, td').filter((_, el) => {
    const text = normalizeWhitespace($(el).text());
    return /^description:?$/i.test(text) || /^description\s*:/i.test(text);
  }).first();

  if (labelElement && labelElement.length > 0) {
    const value = extractSiblingValue($, labelElement);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractSiblingValue($, labelElement) {
  const direct = labelElement.nextAll().filter((_, el) => normalizeWhitespace($(el).text()).length > 0).first();
  if (direct && direct.length > 0) {
    return normalizeWhitespace(direct.text());
  }

  const parent = labelElement.parent();
  if (parent && parent.length > 0) {
    if (parent.is('tr')) {
      const cells = parent.children('td,th');
      const index = cells.index(labelElement);
      if (index >= 0) {
        const nextCells = cells.slice(index + 1);
        const valueCell = nextCells.filter((_, el) => normalizeWhitespace($(el).text()).length > 0).first();
        if (valueCell && valueCell.length > 0) {
          return normalizeWhitespace(valueCell.text());
        }
      }
    }

    if (/dt/i.test(labelElement.get(0)?.name ?? '')) {
      const dd = labelElement.nextAll('dd').filter((_, el) => normalizeWhitespace($(el).text()).length > 0).first();
      if (dd && dd.length > 0) {
        return normalizeWhitespace(dd.text());
      }
    }
  }

  const nextRow = parent && parent.length > 0 ? parent.next('tr') : null;
  if (nextRow && nextRow.length > 0) {
    const value = normalizeWhitespace(nextRow.find('td').first().text());
    if (value) {
      return value;
    }
  }

  return null;
}

function findDescription($) {
  const direct = findFirstText($, DESCRIPTION_SELECTORS);
  if (direct) {
    return direct;
  }

  const fromPairs = findDescriptionFromPairs($);
  if (fromPairs) {
    return fromPairs;
  }

  const fromTable = findDescriptionFromTable($);
  if (fromTable) {
    return fromTable;
  }

  const fallbackElement = $('body')
    .find('p, span, div, strong')
    .filter((_, el) => /^description\s*:/i.test(normalizeWhitespace($(el).text())))
    .first();

  if (fallbackElement && fallbackElement.length > 0) {
    const text = normalizeWhitespace(fallbackElement.text());
    const match = text.match(/^description\s*:\s*(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function findCategoryFromPairs($) {
  const containerSelectors = [
    '.ps-field',
    '.ps-part-summary__meta',
    '.ps-part-summary__detail',
    '.ps-attribute',
    '.ps-detail-row',
    '.ps-part-attribute',
    '.field-row',
    '.part-summary__row'
  ];

  for (const selector of containerSelectors) {
    const container = $(selector);
    if (!container || container.length === 0) {
      continue;
    }

    let result = null;
    container.each((_, element) => {
      const wrapper = $(element);
      const label = wrapper.find('.ps-field-label, .field-label, .ps-label, .label, .heading, .ps-part-attribute__label').first();
      const value = wrapper.find('.ps-field-value, .field-value, .ps-value, .value, .content, .ps-part-attribute__value').first();
      const labelText = normalizeWhitespace(label.text());
      if (/category/i.test(labelText)) {
        const valueText = stripCategoryLabel(value.text());
        if (valueText) {
          result = valueText;
          return false;
        }
      }

      return undefined;
    });

    if (result) {
      return result;
    }
  }

  const dt = $('dt').filter((_, el) => /category/i.test(normalizeWhitespace($(el).text()))).first();
  if (dt && dt.length > 0) {
    const dd = dt.nextAll('dd').filter((_, el) => normalizeWhitespace($(el).text()).length > 0).first();
    const value = stripCategoryLabel(dd.text());
    if (value) {
      return value;
    }
  }

  const labelElement = $('span, strong, label, div, th, td').filter((_, el) => {
    const text = normalizeWhitespace($(el).text());
    return /^category:?$/i.test(text) || /^category\s*:/i.test(text);
  }).first();

  if (labelElement && labelElement.length > 0) {
    const value = extractSiblingValue($, labelElement);
    if (value) {
      return stripCategoryLabel(value);
    }
  }

  return null;
}

function findCategory($) {
  const direct = findFirstText($, CATEGORY_SELECTORS);
  if (direct) {
    return stripCategoryLabel(direct);
  }

  const fromPairs = findCategoryFromPairs($);
  if (fromPairs) {
    return fromPairs;
  }

  const metaTag = $('meta[name="product:category"], meta[property="og:category"], meta[name="category"], meta[name="product-category"]').first();
  if (metaTag && metaTag.length > 0) {
    const content = stripCategoryLabel(metaTag.attr('content'));
    if (content) {
      return content;
    }
  }

  return null;
}

function detectNoResults($) {
  const text = normalizeWhitespace($('body').text());
  return NO_RESULTS_PATTERNS.some((pattern) => pattern.test(text));
}

function detectBomPresence($) {
  let sawContainer = false;
  let sawPositiveText = false;
  for (const selector of BOM_CONTAINER_SELECTORS) {
    const container = $(selector).first();
    if (!container || container.length === 0) {
      continue;
    }

    sawContainer = true;
    const rowCount = container.find('tr').filter((_, row) => $(row).find('td').length > 0).length;
    const listCount = container.find('li').length;
    if (rowCount > 0 || listCount > 0) {
      return true;
    }

    const containerText = normalizeWhitespace(container.text());
    if (containerText) {
      if (BOM_NEGATIVE_PATTERNS.some((pattern) => pattern.test(containerText))) {
        return false;
      }
      if (/bill of material/i.test(containerText)) {
        sawPositiveText = true;
      }
    }
  }

  const bodyText = normalizeWhitespace($('body').text());
  if (BOM_NEGATIVE_PATTERNS.some((pattern) => pattern.test(bodyText))) {
    return false;
  }

  if (sawPositiveText) {
    return true;
  }

  if (sawContainer) {
    return false;
  }

  return false;
}

function extractImageUrl($) {
  for (const selector of IMAGE_SELECTORS) {
    const element = $(selector).first();
    if (!element || element.length === 0) {
      continue;
    }

    for (const attr of IMAGE_ATTRIBUTE_CANDIDATES) {
      const value = element.attr(attr);
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (normalized) {
        const url = absolutizeUrl(normalized);
        if (url) {
          return url;
        }
      }
    }
  }

  const metaImage = $('meta[property="og:image"], meta[name="twitter:image"]').first();
  if (metaImage && metaImage.length > 0) {
    const url = absolutizeUrl(metaImage.attr('content'));
    if (url) {
      return url;
    }
  }

  const link = $('a[href*="ShowPhoto.aspx"], a[href*="/image"], a[href*="/Image"], a[href*=".jpg"], a[href*=".png"]').first();
  if (link && link.length > 0) {
    const href = link.attr('href');
    const url = absolutizeUrl(href);
    if (url) {
      return url;
    }
  }

  return null;
}

export function parseSearch(html) {
  if (!html) {
    return { description: null, category: null, bomPresent: false, imageUrl: null };
  }

  const $ = load(html);

  if (detectNoResults($)) {
    return { description: null, category: null, bomPresent: false, imageUrl: null };
  }

  const description = findDescription($);
  const category = findCategory($);
  const bomPresent = detectBomPresence($);
  const imageUrl = extractImageUrl($);

  return {
    description: description || null,
    category: category || null,
    bomPresent,
    imageUrl
  };
}
