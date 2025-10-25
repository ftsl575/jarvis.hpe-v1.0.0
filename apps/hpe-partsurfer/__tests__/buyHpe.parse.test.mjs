import { readFile } from 'node:fs/promises';
import { parseBuyHpe } from '../src/parseBuyHpe.js';

describe('parseBuyHpe', () => {
  it('extracts product data from JSON-LD payload', async () => {
    const fileUrl = new URL('../fixtures/buyhpe/product-jsonld.html', import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toEqual({
      title: 'HPE ProLiant DL380 Gen10 Server',
      price: '12345.67',
      priceCurrency: 'USD',
      availability: 'InStock',
      sku: 'Q1J09B',
      partNumber: 'Q1J09B',
      url: 'https://buy.hpe.com/us/en/p/Q1J09B',
      image: 'https://assets.ext.hpe.com/is/image/hpedam/proliant-dl380?wid=1200&hei=630',
      category: 'Servers'
    });
  });

  it('falls back to DOM parsing when JSON-LD is missing', async () => {
    const fileUrl = new URL('../fixtures/buyhpe/search-fallback.html', import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toEqual({
      title: 'HPE Aruba Networking 630 Series',
      price: '1,599.00',
      priceCurrency: 'USD',
      availability: 'InStock',
      sku: 'R7K89A',
      partNumber: 'R7K89A',
      url: 'https://buy.hpe.com/us/en/p/R7K89A',
      image: 'https://buy.hpe.com/content/dam/hpe/aruba-630.png',
      category: 'Networking > Access Points > Wi-Fi 6E'
    });
  });
});
