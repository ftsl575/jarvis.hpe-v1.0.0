import { load } from 'cheerio';
import { absolutizeUrl, collapseWhitespace, normalizeText } from './normalize.js';

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

const COMPATIBILITY_CONTAINER_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_gvCompat',
  '#ctl00_BodyContentPlaceHolder_lvCompat',
  '.ps-compatibility',
  '.compatibility-table',
  '.compatibility-list',
  '[data-component="compatibility"]',
  '[data-component*="compat"]',
  'div[id*="Compat"]',
  'section[id*="Compat"]'
];

const REPLACEMENT_CONTAINER_SELECTORS = [
  '.ps-replacements',
  '.replacement-info',
  '.ps-part-summary__detail',
  '.ps-field',
  '.ps-attribute',
  '.ps-detail-row',
  '.replacement-row',
  '.ps-part-attribute',
  '.ps-related-part',
  '[data-component*="replacement"]'
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

const IMAGE_ATTRIBUTE_CANDIDATES = ['data-large', 'data-original', 'data-src', 'src', 'content'];

const NO_RESULTS_PATTERNS = [
  /no results/i,
  /did not return any records/i,
  /no matches/i,
  /could not find/i,
  /unable to locate/i,
  /not found/i
];

const MULTI_RESULT_SELECTORS = [
  '#ctl00_BodyContentPlaceHolder_gvResult',
  '.ps-search-results',
  '.ps-search-results__list',
  '.ps-search-results__items',
  '.search-results-grid',
  '.results-list'
];

const MULTI_RESULT_PATTERNS = [
  /multiple results/i,
  /select a part/i,
  /matching results/i
];

const BOM_NEGATIVE_PATTERNS = [
  /bill of material is not available/i,
  /bill of materials? not available/i,
  /bom is not available/i,
  /no bill of material/i,
  /this product has no options/i,
  /no options are associated/i
];

const REPLACED_BY_PATTERNS = [/replaced by/i, /replacement part/i];
const SUBSTITUTE_PATTERNS = [/substitute/i, /alternate part/i];

const PART_NUMBER_PATTERN = /[A-Z0-9]{3,10}(?:-[A-Z0-9]{2,8})?/;

function isPlaceholderUrl(url) {
  if (!url) {
    return true;
  }

  return /imagenotfound|placeholder|noimage/i.test(url);
}

function stripCategoryLabel(value) {
  if (!value) {
    return '';
  }

  const normalized = normalizeText(value);
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
    return normalizeText(element.attr('content'));
  }

  if (nodeName === 'input') {
    return normalizeText(element.attr('value'));
  }

  return normalizeText(element.text());
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

function extractSiblingValue($, labelElement) {
  const direct = labelElement.nextAll().filter((_, el) => normalizeText($(el).text()).length > 0).first();
  if (direct && direct.length > 0) {
    return normalizeText(direct.text());
  }

  const parent = labelElement.parent();
  if (parent && parent.length > 0) {
    if (parent.is('tr')) {
      const cells = parent.children('td,th');
      const index = cells.index(labelElement);
      if (index >= 0) {
        const nextCells = cells.slice(index + 1);
        const valueCell = nextCells.filter((_, el) => normalizeText($(el).text()).length > 0).first();
        if (valueCell && valueCell.length > 0) {
          return normalizeText(valueCell.text());
        }
      }
    }

    if (/dt/i.test(labelElement.get(0)?.name ?? '')) {
      const dd = labelElement.nextAll('dd').filter((_, el) => normalizeText($(el).text()).length > 0).first();
      if (dd && dd.length > 0) {
        return normalizeText(dd.text());
      }
    }
  }

  const nextRow = parent && parent.length > 0 ? parent.next('tr') : null;
  if (nextRow && nextRow.length > 0) {
    const value = normalizeText(nextRow.find('td').first().text());
    if (value) {
      return value;
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
      const headerText = normalizeText($(header).text());
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

      const candidate = normalizeText($(cells[descriptionIndex]).text());
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
      const labelText = normalizeText(label.text());
      if (/description/i.test(labelText)) {
        const valueText = normalizeText(value.text());
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

  const dt = $('dt').filter((_, el) => /description/i.test(normalizeText($(el).text()))).first();
  if (dt && dt.length > 0) {
    const dd = dt.nextAll('dd').filter((_, el) => normalizeText($(el).text()).length > 0).first();
    const value = normalizeText(dd.text());
    if (value) {
      return value;
    }
  }

  const labelElement = $('span, strong, label, div, th, td').filter((_, el) => {
    const text = normalizeText($(el).text());
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
    .filter((_, el) => /^description\s*:/i.test(normalizeText($(el).text())))
    .first();

  if (fallbackElement && fallbackElement.length > 0) {
    const text = normalizeText(fallbackElement.text());
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
      const labelText = normalizeText(label.text());
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

  const dt = $('dt').filter((_, el) => /category/i.test(normalizeText($(el).text()))).first();
  if (dt && dt.length > 0) {
    const dd = dt.nextAll('dd').filter((_, el) => normalizeText($(el).text()).length > 0).first();
    const value = stripCategoryLabel(dd.text());
    if (value) {
      return value;
    }
  }

  const labelElement = $('span, strong, label, div, th, td').filter((_, el) => {
    const text = normalizeText($(el).text());
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
  const text = collapseWhitespace($('body').text());
  return NO_RESULTS_PATTERNS.some((pattern) => pattern.test(text));
}

function detectMultipleResults($) {
  for (const selector of MULTI_RESULT_SELECTORS) {
    const container = $(selector).first();
    if (!container || container.length === 0) {
      continue;
    }

    const rows = container.find('tr').filter((_, row) => $(row).find('td').length > 0).length;
    const items = container.find('li, .ps-search-results__item, .result-row').length;
    if (rows > 1 || items > 1) {
      return true;
    }
  }

  const text = collapseWhitespace($('body').text());
  return MULTI_RESULT_PATTERNS.some((pattern) => pattern.test(text));
}

function isLikelyPartNumber(value) {
  if (!value) {
    return false;
  }

  const normalized = value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  if (!PART_NUMBER_PATTERN.test(normalized)) {
    return false;
  }

  return true;
}

function extractPartNumber(text) {
  if (!text) {
    return null;
  }

  const normalized = text.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  const match = normalized.match(PART_NUMBER_PATTERN);
  return match ? match[0] : null;
}

function parseRowItem($, element) {
  const row = $(element);
  const link = row.find('a').filter((_, anchor) => isLikelyPartNumber(normalizeText($(anchor).text()))).first();
  const linkText = link && link.length > 0 ? normalizeText(link.text()) : '';
  let partNumber = linkText ? extractPartNumber(linkText) : null;
  if (!partNumber) {
    const fallback = normalizeText(row.find('td, span, strong').first().text());
    partNumber = extractPartNumber(fallback);
  }

  let descriptionText = normalizeText(row.text());
  if (linkText) {
    const escaped = linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withoutLink = descriptionText.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '');
    descriptionText = normalizeText(withoutLink);
  }

  if (partNumber && descriptionText && descriptionText.toUpperCase() === partNumber.toUpperCase()) {
    descriptionText = '';
  }

  return {
    partNumber: partNumber || null,
    description: descriptionText || null
  };
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function parseBom($) {
  const items = [];
  let sawContainer = false;
  let sawNegative = false;

  for (const selector of BOM_CONTAINER_SELECTORS) {
    const container = $(selector).first();
    if (!container || container.length === 0) {
      continue;
    }

    sawContainer = true;
    const containerText = normalizeText(container.text());
    if (containerText && BOM_NEGATIVE_PATTERNS.some((pattern) => pattern.test(containerText))) {
      sawNegative = true;
    }

    const rows = container.find('tr').filter((_, row) => $(row).find('td').length > 0).toArray();
    for (const row of rows) {
      const item = parseRowItem($, row);
      if (item.partNumber || item.description) {
        items.push(item);
      }
    }

    const listItems = container.find('li').toArray();
    for (const listItem of listItems) {
      const item = parseRowItem($, listItem);
      if (item.partNumber || item.description) {
        items.push(item);
      }
    }
  }

  if (!sawContainer) {
    const bodyText = collapseWhitespace($('body').text());
    if (BOM_NEGATIVE_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      sawNegative = true;
    }
  }

  const filtered = uniqueByKey(items, (item) => `${item.partNumber ?? ''}|${item.description ?? ''}`);

  return {
    items: filtered,
    sawContainer,
    sawNegative
  };
}

function parseCompatibility($) {
  const items = [];

  for (const selector of COMPATIBILITY_CONTAINER_SELECTORS) {
    const container = $(selector).first();
    if (!container || container.length === 0) {
      continue;
    }

    const rows = container.find('tr').filter((_, row) => $(row).find('td').length > 0).toArray();
    for (const row of rows) {
      const item = parseRowItem($, row);
      if (item.partNumber || item.description) {
        items.push(item);
      }
    }

    const listItems = container.find('li').toArray();
    for (const listItem of listItems) {
      const item = parseRowItem($, listItem);
      if (item.partNumber || item.description) {
        items.push(item);
      }
    }
  }

  const filtered = uniqueByKey(items, (item) => `${item.partNumber ?? ''}|${item.description ?? ''}`);
  return filtered;
}

function extractPartReference($, patterns) {
  for (const selector of REPLACEMENT_CONTAINER_SELECTORS) {
    const container = $(selector);
    if (!container || container.length === 0) {
      continue;
    }

    const text = normalizeText(container.text());
    if (!text) {
      continue;
    }

    if (!patterns.some((pattern) => pattern.test(text))) {
      continue;
    }

    const links = container.find('a').toArray();
    for (const link of links) {
      const linkElement = $(link);
      const linkText = normalizeText(linkElement.text());
      const part = extractPartNumber(linkText);
      if (!part) {
        continue;
      }

      const parentText = normalizeText(linkElement.parent().text());
      if (parentText && patterns.some((pattern) => pattern.test(parentText))) {
        return part;
      }
    }

    for (const link of links) {
      const part = extractPartNumber(normalizeText($(link).text()));
      if (part) {
        return part;
      }
    }

    const match = text.match(PART_NUMBER_PATTERN);
    if (match) {
      return match[0];
    }
  }

  const bodyText = collapseWhitespace($('body').text());
  for (const pattern of patterns) {
    const regex = new RegExp(`${pattern.source}[^A-Z0-9]*(${PART_NUMBER_PATTERN.source})`, 'i');
    const match = bodyText.match(regex);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
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
        if (url && !isPlaceholderUrl(url)) {
          return url;
        }
      }
    }
  }

  const metaImage = $('meta[property="og:image"], meta[name="twitter:image"]').first();
  if (metaImage && metaImage.length > 0) {
    const url = absolutizeUrl(metaImage.attr('content'));
    if (url && !isPlaceholderUrl(url)) {
      return url;
    }
  }

  const link = $('a[href*="ShowPhoto.aspx"], a[href*="/image"], a[href*="/Image"], a[href*=".jpg"], a[href*=".png"]').first();
  if (link && link.length > 0) {
    const href = link.attr('href');
    const url = absolutizeUrl(href);
    if (url && !isPlaceholderUrl(url)) {
      return url;
    }
  }

  return null;
}

export function parseSearch(html) {
  if (!html) {
    return {
      description: null,
      category: null,
      imageUrl: null,
      bomItems: [],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null,
      multipleResults: false,
      notFound: true,
      bomSectionFound: false,
      bomUnavailable: false
    };
  }

  const $ = load(html);

  const multipleResults = detectMultipleResults($);
  const notFound = !multipleResults && detectNoResults($);

  const description = multipleResults ? null : findDescription($);
  const category = description ? findCategory($) : findCategory($);
  const imageUrl = extractImageUrl($);
  const bom = parseBom($);
  const compatibleProducts = parseCompatibility($);
  const replacedBy = extractPartReference($, REPLACED_BY_PATTERNS);
  const substitute = extractPartReference($, SUBSTITUTE_PATTERNS);

  return {
    description: description || null,
    category: category || null,
    imageUrl,
    bomItems: bom.items,
    compatibleProducts,
    replacedBy: replacedBy || null,
    substitute: substitute || null,
    multipleResults,
    notFound,
    bomSectionFound: bom.sawContainer,
    bomUnavailable: bom.sawNegative
  };
}
