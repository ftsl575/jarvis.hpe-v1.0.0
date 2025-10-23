const SEARCH_MODE = 'Search';
const PHOTO_MODE = 'Photo';

const PHOTO_ONLY_PARTS = new Set(['AF573A', 'R2J63A', 'BD505A', 'Q1J09B']);

const DEFAULT_FALLBACK_STATUSES = new Set(['not_found']);
const SEARCH_WITH_PHOTO_FALLBACK_STATUSES = new Set(['no_bom', 'not_found']);

function determineMode(partNumber) {
  const normalized = String(partNumber || '')
    .trim()
    .toUpperCase();

  if (!normalized) {
    return {
      normalizedPartNumber: normalized,
      modes: [SEARCH_MODE],
      fallbackStatuses: SEARCH_WITH_PHOTO_FALLBACK_STATUSES
    };
  }

  if (PHOTO_ONLY_PARTS.has(normalized)) {
    return {
      normalizedPartNumber: normalized,
      modes: [PHOTO_MODE],
      fallbackStatuses: new Set()
    };
  }

  if (/-B2[12]$/i.test(normalized)) {
    return {
      normalizedPartNumber: normalized,
      modes: [SEARCH_MODE],
      fallbackStatuses: new Set()
    };
  }

  if (/-00[12]$/i.test(normalized)) {
    return {
      normalizedPartNumber: normalized,
      modes: [SEARCH_MODE, PHOTO_MODE],
      fallbackStatuses: SEARCH_WITH_PHOTO_FALLBACK_STATUSES
    };
  }

  return {
    normalizedPartNumber: normalized,
    modes: [SEARCH_MODE, PHOTO_MODE],
    fallbackStatuses: DEFAULT_FALLBACK_STATUSES
  };
}

module.exports = {
  determineMode,
  SEARCH_MODE,
  PHOTO_MODE
};
