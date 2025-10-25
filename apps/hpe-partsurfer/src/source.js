// apps/hpe-partsurfer/src/source.js
// ESM utility to classify result source pages into short codes.
// Usage:
//   import { classifySource } from './source.js';
//   const code = classifySource({ url, page, host });
//
// Returned codes:
//   psurf | photo | buyhpe | misc

/** @typedef {{url?: string, page?: string, host?: string}} SourceHint */

const CODES = Object.freeze({
  PSURF: 'psurf',
  PHOTO: 'photo',
  BUYHPE: 'buyhpe',
  MISC: 'misc',
});

/**
 * Normalize string safely.
 * @param {string|undefined|null} s
 * @returns {string}
 */
function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Extract host from URL if possible.
 * @param {string} u
 * @returns {string}
 */
function hostFromUrl(u) {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extract pathname from URL if possible.
 * @param {string} u
 * @returns {string}
 */
function pathFromUrl(u) {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Classify a source using URL, page id, or host.
 * @param {SourceHint} hint
 * @returns {'psurf'|'photo'|'buyhpe'|'misc'}
 */
export function classifySource(hint = {}) {
  const url = norm(hint.url);
  const page = norm(hint.page);
  const host = norm(hint.host) || hostFromUrl(url);
  const path = pathFromUrl(url);

  // Photo.PartSurfer
  if (
    page === 'photo' ||
    path.includes('/photo.aspx') ||
    url.includes('photo.aspx')
  ) {
    return CODES.PHOTO;
  }

  // PartSurfer search/details
  if (
    page === 'search' ||
    host.includes('partsurfer') ||
    path.includes('/search.aspx') ||
    url.includes('search.aspx')
  ) {
    return CODES.PSURF;
  }

  // buy.hpe or commerce subdomains
  if (
    host.includes('buy.hpe') ||
    host.includes('commerce.hpe') ||
    host.includes('hpe.com') && (path.includes('/buy') || path.includes('/shop'))
  ) {
    return CODES.BUYHPE;
  }

  return CODES.MISC;
}

export const SOURCE_CODES = CODES;
