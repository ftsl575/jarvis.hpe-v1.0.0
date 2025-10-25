const NBSP_PATTERN = /\u00A0/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const CONTROL_PATTERN = /[\u0000-\u001F\u007F]+/g;
const MAX_LENGTH = 1024;
const BLOCKLIST_PATTERNS = [
  /\bbuy\s+hpe/i,
  /\bpartsurfer\b/i,
  /service\s+parts\s+information/i
];

function isString(value) {
  return typeof value === 'string' || value instanceof String;
}

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

function decodeHtmlEntities(value) {
  if (!isString(value) || value.length === 0) {
    return '';
  }

  return value
    .replace(/&#(\d+);/g, (_, digits) => decodeNumericEntity(digits, 10) ?? _)
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => decodeNumericEntity(digits, 16) ?? _)
    .replace(/&([a-z]+);/gi, (match, name) => {
      switch (name.toLowerCase()) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default:
          return match;
      }
    });
}

export function collapseWhitespace(value) {
  if (!isString(value)) {
    return '';
  }

  return value.replace(NBSP_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  if (!isString(value)) {
    return '';
  }

  return value.replace(HTML_TAG_PATTERN, ' ');
}

export function normalizeText(value, { maxLength = MAX_LENGTH } = {}) {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = String(value)
    .replace(CONTROL_PATTERN, ' ')
    .normalize('NFKC');

  const decoded = decodeHtmlEntities(stripHtml(stringValue));
  const collapsed = collapseWhitespace(decoded);

  if (!collapsed) {
    return '';
  }

  if (BLOCKLIST_PATTERNS.some((pattern) => pattern.test(collapsed))) {
    return '';
  }

  if (collapsed.length > maxLength) {
    return collapsed.slice(0, maxLength).trim();
  }

  return collapsed;
}

export function sanitizeEvidenceSnippet(snippet) {
  const normalized = normalizeText(snippet, { maxLength: MAX_LENGTH });
  return normalized;
}

export { decodeHtmlEntities };
export default normalizeText;
