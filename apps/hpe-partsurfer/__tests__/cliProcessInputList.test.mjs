import { describe, expect, test } from '@jest/globals';
import {
  CSV_HEADERS,
  buildCsvContent,
  toCsvValue,
  allProvidersFailed,
  shouldAutoCorrect
} from '../src/cliProcessInputList.mjs';

function createRow(overrides = {}) {
  const row = {};
  for (const header of CSV_HEADERS) {
    row[header] = '';
  }
  return { ...row, ...overrides };
}

describe('cliProcessInputList helpers', () => {
  test('CSV headers group titles before technical fields', () => {
    expect(CSV_HEADERS.slice(0, 5)).toEqual([
      '#',
      'PartNumber',
      'PS_Title',
      'PSPhoto_Title',
      'BUY_Title'
    ]);
  });

  test('buildCsvContent emits BOM and escapes semicolons', () => {
    const rows = [
      createRow({ '#': '1', PartNumber: 'P00000-001', PS_Title: 'Foo;Bar' })
    ];
    const csv = buildCsvContent(rows, ',');
    expect(csv.startsWith('\ufeff')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    expect(lines[1]).toContain('"Foo;Bar"');
  });

  test('allProvidersFailed treats Product Not Found as missing', () => {
    const row = createRow({ BUY_URL: 'Product Not Found', BUY_Error: 'not found' });
    expect(allProvidersFailed(row)).toBe(true);
  });

  test('shouldAutoCorrect respects deny list and suffix rule', () => {
    expect(shouldAutoCorrect('A1234-002')).toBe(true);
    expect(shouldAutoCorrect('804329-002')).toBe(false);
    expect(shouldAutoCorrect('P00000-001')).toBe(false);
  });

  test('toCsvValue escapes semicolons even for comma delimiters', () => {
    expect(toCsvValue('alpha;beta', ',')).toBe('"alpha;beta"');
  });
});
