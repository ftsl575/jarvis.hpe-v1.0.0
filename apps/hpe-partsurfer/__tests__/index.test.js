const {
  VALID_PATTERN,
  normalizePartNumber,
  evaluatePartNumber,
  evaluatePartNumbers
} = require('../src/index');

describe('normalizePartNumber', () => {
  test('trims and uppercases input', () => {
    expect(normalizePartNumber('  ab-12 ')).toBe('AB-12');
  });

  test('throws when not given a string', () => {
    expect(() => normalizePartNumber(null)).toThrow('Part number must be a string');
  });
});

describe('evaluatePartNumber', () => {
  test('marks valid part numbers', () => {
    const result = evaluatePartNumber('a1b2-3c');
    expect(result.status).toBe('VALID');
    expect(result.partNumber).toBe('A1B2-3C');
  });

  test('marks invalid part numbers', () => {
    const result = evaluatePartNumber('bad-number!');
    expect(result.status).toBe('INVALID');
  });
});

describe('evaluatePartNumbers', () => {
  test('evaluates an array of part numbers', () => {
    const results = evaluatePartNumbers(['A1234', 'bad!']);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('VALID');
    expect(results[1].status).toBe('INVALID');
  });

  test('requires an array', () => {
    expect(() => evaluatePartNumbers('not-array')).toThrow('Part numbers must be provided as an array');
  });
});

describe('VALID_PATTERN', () => {
  test('matches expected part number formats', () => {
    expect(VALID_PATTERN.test('AB12-345')).toBe(true);
    expect(VALID_PATTERN.test('123456')).toBe(true);
    expect(VALID_PATTERN.test('ABCD-1234')).toBe(true);
  });

  test('rejects unexpected formats', () => {
    expect(VALID_PATTERN.test('12')).toBe(false);
    expect(VALID_PATTERN.test('ABCDE-12345-XYZ')).toBe(false);
    expect(VALID_PATTERN.test('ABC 123')).toBe(false);
  });
});
