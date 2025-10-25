import { readFile } from 'node:fs/promises';
import { parseBuyHpe } from '../src/parseBuyHpe.js';

describe('parseBuyHpe', () => {
  it('extracts product data from JSON-LD payload', async () => {
    const fileUrl = new URL('../fixtures/buyhpe/product-jsonld.html', import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toEqual({
      title: 'HPE ProLiant DL380 Gen10 Server',
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
      sku: 'R7K89A',
      partNumber: 'R7K89A',
      url: 'https://buy.hpe.com/us/en/p/R7K89A',
      image: 'https://buy.hpe.com/content/dam/hpe/aruba-630.png',
      category: 'Networking > Access Points > Wi-Fi 6E'
    });
  });

  it.each([
    ['p00930-b21.html', 'HPE ProLiant DL380 Gen10 Server', 'https://buy.hpe.com/us/en/p/P00930-B21'],
    ['p18422-b21.html', 'HPE ProLiant DL325 Gen10 Plus Server', 'https://buy.hpe.com/us/en/p/P18422-B21'],
    ['455883-b21.html', 'HPE 800W Flex Slot Platinum Hot Plug Power Supply Kit', 'https://buy.hpe.com/us/en/p/455883-B21'],
    ['874543-b21.html', 'HPE Smart Storage Battery', 'https://buy.hpe.com/us/en/p/874543-B21']
  ])('extracts product title from %s selectors', async (fixture, expectedTitle, expectedUrl) => {
    const fileUrl = new URL(`../fixtures/buyhpe/${fixture}`, import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toMatchObject({
      title: expectedTitle,
      url: expectedUrl
    });
  });

  it('uses meta title when heading selectors are missing', async () => {
    const fileUrl = new URL('../fixtures/buyhpe/meta-title.html', import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toEqual({
      title: 'HPE Aruba CX Switch',
      sku: 'JL815A',
      partNumber: 'JL815A',
      url: 'https://buy.hpe.com/us/en/p/JL815A',
      image: 'https://buy.hpe.com/content/dam/hpe/aruba-cx-switch.png',
      category: 'Networking'
    });
  });

  it('returns null when no title is present', async () => {
    const fileUrl = new URL('../fixtures/buyhpe/empty-template.html', import.meta.url);
    const html = await readFile(fileUrl, 'utf8');
    const result = parseBuyHpe(html, { url: fileUrl.href });

    expect(result).toBeNull();
  });
});
