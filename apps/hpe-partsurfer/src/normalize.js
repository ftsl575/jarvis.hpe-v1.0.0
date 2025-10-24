const HPE_BASE_URL = 'https://partsurfer.hpe.com/';

function isString(value) {
  return typeof value === 'string';
}

export function collapseWhitespace(value) {
  if (!isString(value)) {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"]
]);

function decodeNumericEntity(value, base) {
  const codePoint = Number.parseInt(value, base);
  if (!Number.isFinite(codePoint)) {
    return null;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch (error) {
    return null;
  }
}

export function decodeHtmlEntities(value) {
  if (!isString(value) || value.length === 0) {
    return '';
  }

  return value
    .replace(/&#(\d+);/g, (_, digits) => {
      const decoded = decodeNumericEntity(digits, 10);
      return decoded ?? _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => {
      const decoded = decodeNumericEntity(digits, 16);
      return decoded ?? _;
    })
    .replace(/&([a-z]+);/gi, (_, name) => {
      const lowered = name.toLowerCase();
      if (NAMED_ENTITIES.has(lowered)) {
        return NAMED_ENTITIES.get(lowered);
      }

      return _;
    });
}

export function normalizeText(value) {
  if (!isString(value)) {
    return '';
  }

  return collapseWhitespace(decodeHtmlEntities(value));
}

export function absolutizeUrl(url, base = HPE_BASE_URL) {
  if (!isString(url)) {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  try {
    return new URL(trimmed, base).toString();
  } catch (error) {
    return null;
  }
}

export function normalizePartNumber(partNumber) {
  if (!isString(partNumber)) {
    throw new TypeError('Part number must be a string');
  }

  return partNumber.trim().toUpperCase();
}

export { HPE_BASE_URL };
