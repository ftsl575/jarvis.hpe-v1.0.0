import { describe, expect, test } from '@jest/globals';
import { normalizePartNumber, normalizeUrl } from '../src/normalize.js';

describe('normalize helpers', () => {
  test('normalizePartNumber uppercases and inserts hyphen', () => {
    expect(normalizePartNumber('  p00930b21 ')).toBe('P00930-B21');
  });

  test('normalizePartNumber expands truncated B2 suffix', () => {
    expect(normalizePartNumber('874543-b2')).toBe('874543-B21');
  });

  test('normalizeUrl enforces https and strips tracking parameters', () => {
    const url = 'http://buy.hpe.com/us/en/p/P00930-B21?utm_source=test&cid=123&ref=internal';
    expect(normalizeUrl(url)).toBe('https://buy.hpe.com/us/en/p/P00930-B21?ref=internal');
  });
});
