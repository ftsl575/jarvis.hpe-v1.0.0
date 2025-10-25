const HPE_BASE_URL = 'https://partsurfer.hpe.com/';

const TRACKING_PARAM_PATTERN = /^(utm_|cid$|cmpid$|gclid$|s_kwcid$|icid$)/i;
const DASH_VARIANTS = /[\u2010-\u2015\u2212]/g;
const SUFFIX_EXPANSIONS = new Map([
  ['B2', 'B21']
]);

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

function normalizeHttpProtocol(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAM_PATTERN.test(key)) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString();
  } catch (error) {
    return null;
  }
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
    return normalizeHttpProtocol(trimmed) ?? trimmed;
  }

  if (trimmed.startsWith('//')) {
    return normalizeHttpProtocol(`https:${trimmed}`) ?? `https:${trimmed}`;
  }

  try {
    const resolved = new URL(trimmed, base).toString();
    return normalizeHttpProtocol(resolved) ?? resolved;
  } catch (error) {
    return null;
  }
}

function expandSuffix(suffix) {
  if (!suffix) {
    return '';
  }

  const expanded = SUFFIX_EXPANSIONS.get(suffix);
  if (expanded) {
    return expanded;
  }

  if (/^[A-Z]\d$/.test(suffix)) {
    return `${suffix}1`;
  }

  return suffix;
}

function formatCanonicalPart(partNumber) {
  const match = partNumber.match(/^([0-9]{7})(?:-?([A-Z0-9]{2,3}))$/);
  if (match) {
    const base = match[1];
    const suffix = expandSuffix(match[2]);
    return `${base}-${suffix}`;
  }

  const compactAlphaMatch = partNumber.match(/^([A-Z0-9]{5,7})([A-Z][A-Z0-9]{1,3})$/);
  if (compactAlphaMatch) {
    const base = compactAlphaMatch[1];
    const suffix = expandSuffix(compactAlphaMatch[2]);
    return `${base}-${suffix}`;
  }

  const generalMatch = partNumber.match(/^([A-Z0-9]{3,10})(?:-([A-Z0-9]{1,4}))$/);
  if (generalMatch) {
    const base = generalMatch[1];
    const suffix = expandSuffix(generalMatch[2]);
    return `${base}-${suffix}`;
  }

  return partNumber;
}

export function normalizePartNumber(partNumber) {
  if (!isString(partNumber)) {
    throw new TypeError('Part number must be a string');
  }

  const trimmed = partNumber.trim();
  if (!trimmed) {
    throw new TypeError('Part number must not be empty');
  }

  const unified = trimmed.replace(DASH_VARIANTS, '-').replace(/\s+/g, '');
  const normalized = unified.replace(/-{2,}/g, '-').replace(/[^A-Z0-9-]/gi, '');
  const upper = normalized.toUpperCase();
  return formatCanonicalPart(upper);
}

export function normalizeUrl(url) {
  if (!isString(url)) {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  const resolved = absolutizeUrl(trimmed) ?? trimmed;
  return resolved;
}

export { HPE_BASE_URL };
