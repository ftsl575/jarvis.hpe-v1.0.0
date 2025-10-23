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

function parsePhoto(html) {
  const $ = cheerio.load(html);
  const description = extractFirst($, [
    '#ctl00_BodyContentPlaceHolder_lblDescription',
    '#ctl00_BodyContentPlaceHolder_lblShortDescription',
    "span[id$='lblDescription']",
    '.part-description'
  ]);

  const imageUrl = toAbsoluteUrl(
    extractFirst(
      $,
      [
        '#ctl00_BodyContentPlaceHolder_imgPart',
        '#ctl00_BodyContentPlaceHolder_Image1',
        "img[id*='imgPart']",
        'img.part-image'
      ],
      'src'
    )
  );

  if (!description) {
    const errorText = extractFirst($, [
      '#ctl00_BodyContentPlaceHolder_lblMessage',
      '#ctl00_BodyContentPlaceHolder_lblError',
      '.no-results'
    ]);

    return {
      sourcePage: 'Photo',
      status: 'not_found',
      description: '',
      imageUrl: errorText ? '' : imageUrl
    };
  }

  return {
    sourcePage: 'Photo',
    status: 'ok',
    description,
    imageUrl
  };
}

module.exports = parsePhoto;
