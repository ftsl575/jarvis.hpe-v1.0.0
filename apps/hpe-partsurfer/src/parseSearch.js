import { load } from 'cheerio';
import { absolutizeUrl, collapseWhitespace, normalizeText } from './normalize.js';

const NO_DESCRIPTION_PATTERN = /^product description not available$/i;

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
  const candidate = match && match[1] ? match[1].trim() : normalized;
  const keywordTrimmed = candidate.replace(/^keywords?\s*(?:[:\-]|is)?\s*/i, '').trim();
  if (!keywordTrimmed && /keywords?/i.test(candidate)) {
    return '';
  }
  return keywordTrimmed || candidate;
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

function sanitizeDescription(value, state) {
  const text = normalizeText(value);
  if (!text || NO_DESCRIPTION_PATTERN.test(text)) {
    if (state && text) {
      state.descriptionUnavailable = true;
    }
    return '';
  }

  return text;
}

function normalizeDetailLabel(value) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  return text.replace(/\s*[:：]\s*$/u, '').trim();
}

function buildDetailsMap($) {
  const map = new Map();

  $('table').each((_, tableElement) => {
    const table = $(tableElement);
    const rows = table.find('tr').toArray();

    for (const rowElement of rows) {
      const row = $(rowElement);
      const cells = row.children('th,td');
      if (!cells || cells.length < 2) {
        continue;
      }

      const labelCell = cells.first();
      const label = normalizeDetailLabel(labelCell.text());
      if (!label) {
        continue;
      }

      const valueCells = cells.slice(1).toArray();
      const parts = valueCells
        .map((cell) => normalizeText($(cell).text()))
        .filter((text) => Boolean(text));
      if (parts.length === 0) {
        continue;
      }

      const value = parts.join(' ').trim();
      if (!value) {
        continue;
      }

      const key = label.toLowerCase();
      if (!map.has(key)) {
        map.set(key, value);
      }
    }
  });

  return map;
}

function getDetailValue(detailsMap, ...labels) {
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (detailsMap.has(key)) {
      return detailsMap.get(key) || null;
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

function extractDetailsTableValue($, cells, labelCell) {
  const remaining = cells.filter((_, cell) => cell !== labelCell.get(0));
  const directValue = remaining
    .filter((_, cell) => normalizeText($(cell).text()).length > 0)
    .first();

  if (directValue && directValue.length > 0) {
    return normalizeText(directValue.text());
  }

  const nestedText = normalizeText(remaining.text());
  return nestedText || null;
}

function findDescriptionFromDetailsTable($) {
  const tables = $('table').toArray();

  for (const tableElement of tables) {
    const table = $(tableElement);
    const rows = table.find('tr').toArray();

    for (const rowElement of rows) {
      const row = $(rowElement);
      const cells = row.children('th,td');
      if (!cells || cells.length < 2) {
        continue;
      }

      const labelCell = cells.first();
      const labelText = normalizeText(labelCell.text());
      if (!/part\s*description/i.test(labelText)) {
        continue;
      }

      const value = extractDetailsTableValue($, cells, labelCell);
      if (value) {
        return value;
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

function findDescription($, detailsMap, state) {
  const canonical = sanitizeDescription(getDetailValue(detailsMap, 'Part Description'), state);
  if (canonical) {
    return canonical;
  }

  const detailsTable = sanitizeDescription(findDescriptionFromDetailsTable($), state);
  if (detailsTable) {
    return detailsTable;
  }

  const direct = findFirstText($, DESCRIPTION_SELECTORS);
  const sanitizedDirect = sanitizeDescription(direct, state);
  if (sanitizedDirect) {
    return sanitizedDirect;
  }

  const fromPairs = findDescriptionFromPairs($);
  const sanitizedPairs = sanitizeDescription(fromPairs, state);
  if (sanitizedPairs) {
    return sanitizedPairs;
  }

  const fromTable = findDescriptionFromTable($);
  const sanitizedTable = sanitizeDescription(fromTable, state);
  if (sanitizedTable) {
    return sanitizedTable;
  }

  const fallbackElement = $('body')
    .find('p, span, div, strong')
    .filter((_, el) => /^description\s*:/i.test(normalizeText($(el).text())))
    .first();

  if (fallbackElement && fallbackElement.length > 0) {
    const text = normalizeText(fallbackElement.text());
    const match = text.match(/^description\s*:\s*(.+)$/i);
    if (match && match[1]) {
      const candidate = sanitizeDescription(match[1], state);
      if (candidate) {
        return candidate;
      }
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

function normalizeCategoryValue(value) {
  const stripped = stripCategoryLabel(value);
  if (!stripped) {
    return '';
  }

  if (/^keywords?$/i.test(stripped)) {
    return '';
  }

  return stripped;
}

const BREADCRUMB_SELECTORS = [
  '[aria-label="Breadcrumb"]',
  'nav.breadcrumb',
  'nav[aria-label="breadcrumb"]',
  'ol.breadcrumb',
  'ul.breadcrumb',
  '.breadcrumb'
];

function findBreadcrumbCategory($) {
  for (const selector of BREADCRUMB_SELECTORS) {
    const breadcrumb = $(selector).first();
    if (!breadcrumb || breadcrumb.length === 0) {
      continue;
    }

    const items = [];
    breadcrumb.find('a, span, li').each((_, element) => {
      const text = normalizeText($(element).text());
      if (text) {
        items.push(text.trim());
      }
    });

    if (items.length === 0) {
      continue;
    }

    const partIndex = items.findIndex((item) => PART_NUMBER_PATTERN.test(item));
    if (partIndex > 0) {
      const candidate = normalizeCategoryValue(items[partIndex - 1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function findCategory($, detailsMap) {
  const detailCategory = getDetailValue(detailsMap, 'Product Category', 'Category');
  const normalizedDetail = normalizeCategoryValue(detailCategory);
  if (normalizedDetail) {
    return normalizedDetail;
  }

  const direct = findFirstText($, CATEGORY_SELECTORS);
  if (direct) {
    const normalized = normalizeCategoryValue(direct);
    if (normalized) {
      return normalized;
    }
  }

  const fromPairs = findCategoryFromPairs($);
  if (fromPairs) {
    const normalizedPairs = normalizeCategoryValue(fromPairs);
    if (normalizedPairs) {
      return normalizedPairs;
    }
  }

  const metaTag = $('meta[name="product:category"], meta[property="og:category"], meta[name="category"], meta[name="product-category"]').first();
  if (metaTag && metaTag.length > 0) {
    const content = normalizeCategoryValue(metaTag.attr('content'));
    if (content) {
      return content;
    }
  }

  const breadcrumb = findBreadcrumbCategory($);
  if (breadcrumb) {
    return breadcrumb;
  }

  return null;
}

function normalizeAvailabilityValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const text = normalized.trim();
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();

  if (/replace/.test(lower)) {
    const candidates = String(value).match(/[A-Z0-9]{3,10}(?:-[A-Z0-9]{2,8})?/gi) || [];
    const withDigits = candidates.find((candidate) => /\d/.test(candidate));
    if (withDigits) {
      return `Replaced (${withDigits.toUpperCase()})`;
    }
    return 'Replaced (PN)';
  }

  if (/end\s*of\s*life/.test(lower) || /\bEOL\b/i.test(value)) {
    return 'End of Life';
  }

  if (/obsolete/.test(lower) || /discontinued/.test(lower)) {
    return 'Obsolete';
  }

  if (/out\s*of\s*stock/.test(lower) || /back ?order/.test(lower)) {
    return 'Out of Stock';
  }

  if (/information\s+only/.test(lower)) {
    return 'Information Only';
  }

  if (/not\s*(?:orderable|available|for sale|supported)/.test(lower) || /^no$/i.test(text) || /^n\/?a$/i.test(text)) {
    return 'Not Orderable';
  }

  if (/available/.test(lower) || /orderable/.test(lower) || /^yes$/i.test(text) || /active/.test(lower)) {
    return 'Available';
  }

  return text;
}

function findAvailabilityFromPairs($) {
  const selectors = [
    '.ps-field',
    '.ps-attribute',
    '.ps-detail-row',
    '.ps-part-attribute',
    '.field-row',
    '.part-summary__row'
  ];

  const labelSelectors = '.ps-field-label, .field-label, .ps-label, .label, .heading, .ps-part-attribute__label';
  const valueSelectors = '.ps-field-value, .field-value, .ps-value, .value, .content, .ps-part-attribute__value, .ps-field-text';

  for (const selector of selectors) {
    const container = $(selector);
    if (!container || container.length === 0) {
      continue;
    }

    let result = null;
    container.each((_, element) => {
      const wrapper = $(element);
      const label = normalizeDetailLabel(wrapper.find(labelSelectors).first().text());
      if (!label) {
        return undefined;
      }

      if (!/^(availability|orderable|status|lifecycle)$/i.test(label)) {
        return undefined;
      }

      const valueText = normalizeText(wrapper.find(valueSelectors).first().text());
      const normalized = normalizeAvailabilityValue(valueText);
      if (normalized) {
        result = normalized;
        return false;
      }

      return undefined;
    });

    if (result) {
      return result;
    }
  }

  const dt = $('dt').filter((_, el) => {
    const text = normalizeDetailLabel($(el).text());
    return /^(availability|orderable|status|lifecycle)$/i.test(text);
  }).first();

  if (dt && dt.length > 0) {
    const dd = dt.nextAll('dd').filter((_, el) => normalizeText($(el).text()).length > 0).first();
    const normalized = normalizeAvailabilityValue(dd.text());
    if (normalized) {
      return normalized;
    }
  }

  const labelElement = $('span, strong, label, div, th, td').filter((_, el) => {
    const text = normalizeDetailLabel($(el).text());
    return /^(availability|orderable|status|lifecycle)$/i.test(text);
  }).first();

  if (labelElement && labelElement.length > 0) {
    const value = extractSiblingValue($, labelElement);
    const normalized = normalizeAvailabilityValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function findAvailability($, detailsMap) {
  const detailValue = getDetailValue(detailsMap, 'Availability', 'Orderable', 'Status', 'Lifecycle');
  const normalizedDetail = normalizeAvailabilityValue(detailValue);
  if (normalizedDetail) {
    return normalizedDetail;
  }

  const fromPairs = findAvailabilityFromPairs($);
  if (fromPairs) {
    return fromPairs;
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

  const detailsMap = buildDetailsMap($);
  const descriptionState = { descriptionUnavailable: false };
  const description = multipleResults ? null : findDescription($, detailsMap, descriptionState);
  const category = description ? findCategory($, detailsMap) : findCategory($, detailsMap);
  const availability = multipleResults ? null : findAvailability($, detailsMap);
  const imageUrl = extractImageUrl($);
  const bom = parseBom($);
  const compatibleProducts = parseCompatibility($);
  const replacedBy = extractPartReference($, REPLACED_BY_PATTERNS);
  const substitute = extractPartReference($, SUBSTITUTE_PATTERNS);
  const manualCheck = !multipleResults && !description && descriptionState.descriptionUnavailable === true;

  return {
    description: description || null,
    category: category || null,
    availability: availability || null,
    imageUrl,
    bomItems: bom.items,
    compatibleProducts,
    replacedBy: replacedBy || null,
    substitute: substitute || null,
    multipleResults,
    notFound,
    bomSectionFound: bom.sawContainer,
    bomUnavailable: bom.sawNegative,
    manualCheck
  };
}
