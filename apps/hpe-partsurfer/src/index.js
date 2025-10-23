const VALID_PATTERN = /^[A-Za-z0-9]{3,6}(?:-[A-Za-z0-9]{2,6})?$/;

function normalizePartNumber(partNumber) {
  if (typeof partNumber !== 'string') {
    throw new TypeError('Part number must be a string');
  }

  return partNumber.trim().toUpperCase();
}

function evaluatePartNumber(partNumber) {
  const normalized = normalizePartNumber(partNumber);
  const isValid = VALID_PATTERN.test(normalized);

  return {
    input: partNumber,
    partNumber: normalized,
    status: isValid ? 'VALID' : 'INVALID'
  };
}

function evaluatePartNumbers(partNumbers) {
  if (!Array.isArray(partNumbers)) {
    throw new TypeError('Part numbers must be provided as an array');
  }

  return partNumbers.map(evaluatePartNumber);
}

module.exports = {
  VALID_PATTERN,
  normalizePartNumber,
  evaluatePartNumber,
  evaluatePartNumbers
};
