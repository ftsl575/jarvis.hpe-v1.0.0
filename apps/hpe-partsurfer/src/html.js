const HPE_BASE_URL = 'https://partsurfer.hpe.com/';

export function normalizeWhitespace(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

export function absolutizeUrl(url, base = HPE_BASE_URL) {
  if (typeof url !== 'string') {
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

export { HPE_BASE_URL };
