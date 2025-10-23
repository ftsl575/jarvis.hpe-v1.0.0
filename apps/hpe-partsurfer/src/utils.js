const { BASE_URL } = require('./fetch');

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAbsoluteUrl(relativeOrAbsolute) {
  const value = normalizeText(relativeOrAbsolute);
  if (!value) {
    return '';
  }
  try {
    return new URL(value, BASE_URL).toString();
  } catch (error) {
    return '';
  }
}

module.exports = {
  normalizeText,
  toAbsoluteUrl
};
