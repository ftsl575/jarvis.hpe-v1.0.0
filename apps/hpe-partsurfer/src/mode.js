import { normalizePartNumber } from './normalize.js';

const ACCESSORY_PATTERN = /^[A-Z0-9]{3,6}A$/;

export function detectMode(partNumber) {
  const normalized = normalizePartNumber(partNumber);

  if (ACCESSORY_PATTERN.test(normalized)) {
    return 'Photo';
  }

  return 'Search';
}

export const FALLBACK_ELIGIBLE_PATTERN = /-(001|002)$/i;
export const SEARCH_ONLY_PATTERN = /-B2[12]$/i;
