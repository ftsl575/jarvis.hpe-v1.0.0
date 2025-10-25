// Minimal ESM Jest test for aggregateMultiSource
import { jest } from '@jest/globals';

const { aggregateMultiSource, NO_DATA_AT_THIS_SOURCE } = await import('../aggregateMultiSource.js');

describe('aggregateMultiSource (structural)', () => {
  test('returns one row per PN', async () => {
    const rows = await aggregateMultiSource(['P12345', 'P98765'], {});
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(typeof r.partNumber).toBe('string');
      expect(typeof r.partsurfer).toBe('string');
      expect(typeof r.partsurferPhoto).toBe('string');
      expect(typeof r.buyHpe).toBe('string');
    }
  });

  test('handles empty providers gracefully', async () => {
    const rows = await aggregateMultiSource(['P00000'], {});
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(typeof r.partNumber).toBe('string');
    expect([NO_DATA_AT_THIS_SOURCE, expect.any(String)]).toContain(r.partsurfer);
    expect([NO_DATA_AT_THIS_SOURCE, expect.any(String)]).toContain(r.partsurferPhoto);
    expect([NO_DATA_AT_THIS_SOURCE, expect.any(String)]).toContain(r.buyHpe);
  });

  test('is deterministic for same input', async () => {
    const a = await aggregateMultiSource(['X1'], {});
    const b = await aggregateMultiSource(['X1'], {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
