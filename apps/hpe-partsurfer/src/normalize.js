export function normalizePartNumber(partNumber) {
  if (typeof partNumber !== 'string') {
    throw new TypeError('Part number must be a string');
  }

  return partNumber.trim().toUpperCase();
}
