const cheerio = require('cheerio');
const { normalizeText, toAbsoluteUrl } = require('./utils');

function extractFirst($, selectors, attribute) {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      if (attribute) {
        const value = element.attr(attribute);
        if (value) {
          return value;
        }
      } else {
        const text = normalizeText(element.text());
        if (text) {
          return text;
        }
      }
    }
  }
  return '';
}

function hasBom($) {
  const bomSpanSelector = "span[id*='gridCOMBOM']";
  const bomTableSelector = "table[id*='gridCOMBOM'] tr";
  const spans = $(bomSpanSelector).toArray();
  if (spans.some((node) => normalizeText($(node).text()))) {
    return true;
  }

  const rows = $(bomTableSelector).toArray();
  return rows.some((row, index) => {
    if (index === 0) {
      // skip header row
      return false;
    }
    const cells = $(row)
      .find('td')
      .toArray()
      .map((cell) => normalizeText($(cell).text()))
      .filter(Boolean);
    return cells.length > 0;
  });
}

function isNotFound($) {
  const indicators = [
    '#ctl00_BodyContentPlaceHolder_lblNoResults',
    '#ctl00_BodyContentPlaceHolder_lblNoMatch',
    '#ctl00_BodyContentPlaceHolder_lblNoRecord',
    '#ctl00_BodyContentPlaceHolder_lblErrorMessage',
    '.no-results'
  ];
  return indicators
    .map((selector) => normalizeText($(selector).text()))
    .some((text) => text.length > 0);
}

function parseSearch(html) {
  const $ = cheerio.load(html);
  const description = extractFirst($, [
    '#ctl00_BodyContentPlaceHolder_lblDescription',
    '#ctl00_BodyContentPlaceHolder_lblProductDescription',
    "span[id$='lblDescription']",
    '.product-description'
  ]);

  const imageUrl = toAbsoluteUrl(
    extractFirst(
      $,
      [
        '#ctl00_BodyContentPlaceHolder_imgProduct',
        "img[id*='imgProduct']",
        'img.product-image'
      ],
      'src'
    )
  );

  const bomPresent = hasBom($);

  if (!description && !bomPresent) {
    if (isNotFound($)) {
      return {
        sourcePage: 'Search',
        status: 'not_found',
        description: '',
        imageUrl: ''
      };
    }
  }

  if (!description && !bomPresent) {
    return {
      sourcePage: 'Search',
      status: 'not_found',
      description: '',
      imageUrl
    };
  }

  const status = bomPresent ? 'ok' : 'no_bom';

  return {
    sourcePage: 'Search',
    status,
    description,
    imageUrl
  };
}

module.exports = parseSearch;
