import { readFile } from 'node:fs/promises';
import { jest } from '@jest/globals';

const fetchBuyHpeMock = jest.fn();

async function loadProvider() {
  jest.resetModules();
  jest.unstable_mockModule('../src/fetchBuyHpe.js', () => ({
    __esModule: true,
    default: fetchBuyHpeMock,
    fetchBuyHpe: fetchBuyHpeMock
  }));
  const module = await import('../src/providerBuyHpe.js');
  return module.providerBuyHpe;
}

describe('providerBuyHpe search fallback', () => {
  beforeEach(() => {
    fetchBuyHpeMock.mockReset();
  });

  it('uses search card when product page returns 403', async () => {
    const searchHtml = await readFile(new URL('../fixtures/buyhpe/search-fallback.html', import.meta.url), 'utf8');
    const forbidden = new Error('Forbidden');
    forbidden.status = 403;
    fetchBuyHpeMock.mockRejectedValueOnce(forbidden);
    fetchBuyHpeMock.mockResolvedValueOnce({
      url: 'https://buy.hpe.com/us/en/search?q=R7K89A',
      status: 200,
      html: searchHtml
    });

    const providerBuyHpe = await loadProvider();
    const result = await providerBuyHpe('R7K89A', { live: true });

    expect(fetchBuyHpeMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      title: 'HPE Aruba Networking 630 Series',
      sku: 'R7K89A',
      partNumber: 'R7K89A',
      url: 'https://buy.hpe.com/us/en/p/R7K89A',
      image: 'https://buy.hpe.com/content/dam/hpe/aruba-630-thumb.png',
      source: 'HPE Buy (buy.hpe.com)',
      fetchedFrom: 'search-card'
    });
  });

  it('propagates 403 when search page lacks product cards', async () => {
    const forbidden = new Error('Forbidden');
    forbidden.status = 403;
    fetchBuyHpeMock.mockRejectedValueOnce(forbidden);
    fetchBuyHpeMock.mockResolvedValueOnce({
      url: 'https://buy.hpe.com/us/en/search?q=R7K89A',
      status: 200,
      html: '<html><body><p>No results</p></body></html>'
    });

    const providerBuyHpe = await loadProvider();

    await expect(providerBuyHpe('R7K89A', { live: true })).rejects.toMatchObject({ status: 403 });
    expect(fetchBuyHpeMock).toHaveBeenCalledTimes(2);
  });
});
