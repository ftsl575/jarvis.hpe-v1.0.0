import { jest } from '@jest/globals';

const runForPartMock = jest.fn();
const runBatchMock = jest.fn();
const providerBuyHpeMock = jest.fn();

jest.unstable_mockModule('../runner.js', () => ({
  runForPart: runForPartMock,
  runBatch: runBatchMock
}));

jest.unstable_mockModule('../providerBuyHpe.js', () => ({
  providerBuyHpe: providerBuyHpeMock,
  default: providerBuyHpeMock
}));

const {
  aggregateProviders,
  aggregateProvidersBatch,
  getAggregatorProviders
} = await import('../index.js');

describe('aggregator pipeline', () => {
  beforeEach(() => {
    runForPartMock.mockReset();
    runBatchMock.mockReset();
    providerBuyHpeMock.mockReset();
  });

  test('aggregateProviders returns provider results in order', async () => {
    runForPartMock.mockResolvedValue({
      part_number: 'Q1J09B',
      status: 'ok'
    });
    providerBuyHpeMock.mockResolvedValue({
      sku: 'Q1J09B',
      price: '12345.67',
      source: 'HPE Buy (buy.hpe.com)'
    });

    const items = await aggregateProviders('q1j09b', { live: true });

    expect(runForPartMock).toHaveBeenCalledWith('Q1J09B', { live: true });
    expect(providerBuyHpeMock).toHaveBeenCalledWith('Q1J09B', { live: true });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      provider: 'partsurfer',
      partNumber: 'Q1J09B',
      source: 'HPE PartSurfer',
      payload: { part_number: 'Q1J09B', status: 'ok' }
    });
    expect(items[1]).toMatchObject({
      provider: 'buy.hpe.com',
      partNumber: 'Q1J09B',
      source: 'HPE Buy (buy.hpe.com)',
      payload: {
        sku: 'Q1J09B',
        price: '12345.67',
        source: 'HPE Buy (buy.hpe.com)'
      }
    });
  });

  test('aggregateProvidersBatch deduplicates part numbers', async () => {
    runForPartMock.mockResolvedValue({ part_number: 'R7K89A' });
    providerBuyHpeMock.mockResolvedValue(null);

    const rows = await aggregateProvidersBatch(['R7K89A', 'r7k89a'], {});

    expect(rows).toEqual([
      {
        partNumber: 'R7K89A',
        items: [
          expect.objectContaining({
            provider: 'partsurfer',
            partNumber: 'R7K89A',
            source: 'HPE PartSurfer'
          })
        ]
      }
    ]);
  });

  test('getAggregatorProviders exposes registered handlers', () => {
    const providers = getAggregatorProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers.every((fn) => typeof fn === 'function')).toBe(true);
  });
});
