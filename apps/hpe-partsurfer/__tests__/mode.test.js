import { describe, expect, test } from '@jest/globals';
import { detectMode, FALLBACK_ELIGIBLE_PATTERN, SEARCH_ONLY_PATTERN } from '../src/mode.js';

describe('detectMode', () => {
  test('returns Photo for accessory-style part numbers', () => {
    expect(detectMode('af573a')).toBe('Photo');
    expect(detectMode('R2J63A')).toBe('Photo');
  });

  test('returns Search for dash-suffixed service part numbers', () => {
    expect(detectMode('511778-001')).toBe('Search');
    expect(detectMode('999999-B21')).toBe('Search');
  });
});

describe('mode patterns', () => {
  test('FALLBACK_ELIGIBLE_PATTERN matches 001/002 suffixes', () => {
    expect(FALLBACK_ELIGIBLE_PATTERN.test('123456-001')).toBe(true);
    expect(FALLBACK_ELIGIBLE_PATTERN.test('123456-002')).toBe(true);
    expect(FALLBACK_ELIGIBLE_PATTERN.test('123456-003')).toBe(false);
  });

  test('SEARCH_ONLY_PATTERN matches B21/B22 suffixes', () => {
    expect(SEARCH_ONLY_PATTERN.test('734567-B21')).toBe(true);
    expect(SEARCH_ONLY_PATTERN.test('734567-B22')).toBe(true);
    expect(SEARCH_ONLY_PATTERN.test('734567-001')).toBe(false);
  });
});
