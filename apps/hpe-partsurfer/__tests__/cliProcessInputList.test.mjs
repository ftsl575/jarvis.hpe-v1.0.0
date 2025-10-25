import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseModule = await import('../src/cliProcessInputList.mjs');
const {
  CSV_HEADERS,
  buildCsvContent,
  toCsvValue,
  allProvidersFailed,
  shouldAutoCorrect
} = baseModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

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

describe('processPart integration', () => {
  const getSearchHtmlMock = jest.fn();
  const getPhotoHtmlMock = jest.fn();
  const providerBuyHpeMock = jest.fn();

  async function importModuleWithMocks() {
    jest.resetModules();
    jest.unstable_mockModule('../src/fetch.js', () => ({
      getSearchHtml: getSearchHtmlMock,
      getPhotoHtml: getPhotoHtmlMock
    }));
    jest.unstable_mockModule('../src/providerBuyHpe.js', () => ({
      providerBuyHpe: providerBuyHpeMock,
      default: providerBuyHpeMock
    }));
    return import('../src/cliProcessInputList.mjs');
  }

  beforeEach(() => {
    getSearchHtmlMock.mockReset();
    getPhotoHtmlMock.mockReset();
    providerBuyHpeMock.mockReset();
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('auto-corrects -002 to -001 when alternate succeeds', async () => {
    const notFoundSearchHtml = '<html><body>No results found</body></html>';
    const successSearchHtml = `<!doctype html><html><body><table><tr><th>Part Description</th><td>System Board Assembly</td></tr></table></body></html>`;
    const successPhotoHtml = `<!doctype html><html><head><title>Cooling Fan Photo</title></head><body><img src="https://cdn.example.com/fan.jpg" /></body></html>`;

    const module = await importModuleWithMocks();
    const { processPart } = module;

    getSearchHtmlMock.mockImplementation(async (sku) => {
      return sku === '780428-002' ? notFoundSearchHtml : successSearchHtml;
    });
    getPhotoHtmlMock.mockImplementation(async (sku) => {
      return sku === '780428-002'
        ? '<html><body>Photo is not available</body></html>'
        : successPhotoHtml;
    });
    providerBuyHpeMock.mockResolvedValue(null);

    const row = await processPart('780428-002', {});

    expect(row.PartNumber).toBe('780428-002 (auto change 780428-001)');
    expect(row.PS_Title).toBe('System Board Assembly');
    expect(row.PSPhoto_Title).toBe('Cooling Fan Photo');
    expect(row.BUY_URL).toBe('Product Not Found');
    expect(row.BUY_Title).toBe('');
    expect(getSearchHtmlMock).toHaveBeenCalledWith('780428-001', expect.any(Object));
    expect(getPhotoHtmlMock).toHaveBeenCalledWith('780428-001', expect.any(Object));
  });

  test('denylisted part numbers are marked for manual review', async () => {
    const module = await importModuleWithMocks();
    const { processPart } = module;

    const row = await processPart('804329-002', {});

    expect(row.PartNumber).toBe('804329-002 (CHECK MANUALLY)');
    expect(row.PS_Error).toBe('CHECK MANUALLY');
    expect(row.PSPhoto_Error).toBe('CHECK MANUALLY');
    expect(row.BUY_Error).toBe('CHECK MANUALLY');
    expect(row.BUY_URL).toBe('Product Not Found');
    expect(getSearchHtmlMock).not.toHaveBeenCalled();
    expect(providerBuyHpeMock).not.toHaveBeenCalled();
  });

  test('buy.hpe 4xx sets Product Not Found', async () => {
    const successSearchHtml = `<!doctype html><html><body><table><tr><th>Part Description</th><td>System Board Assembly</td></tr></table></body></html>`;
    const successPhotoHtml = `<!doctype html><html><head><title>Cooling Fan Photo</title></head><body><img src="https://cdn.example.com/fan.jpg" /></body></html>`;

    const module = await importModuleWithMocks();
    const { processPart } = module;

    getSearchHtmlMock.mockResolvedValue(successSearchHtml);
    getPhotoHtmlMock.mockResolvedValue(successPhotoHtml);
    const error = new Error('Forbidden');
    error.status = 403;
    providerBuyHpeMock.mockRejectedValue(error);

    const row = await processPart('875545-001', {});

    expect(row.BUY_URL).toBe('Product Not Found');
    expect(row.BUY_Error).toBe('not found');
    expect(row.PS_Title).toBe('System Board Assembly');
    expect(row.PSPhoto_Title).toBe('Cooling Fan Photo');
  });

  test('falls back to photo title when search description is empty', async () => {
    const module = await importModuleWithMocks();
    const { processPart } = module;

    getSearchHtmlMock.mockResolvedValue('<html><body><div class="ps-part-summary__title"></div></body></html>');
    getPhotoHtmlMock.mockResolvedValue(
      '<!doctype html><html><head><title>Hot Swap Fan</title></head><body><img src="https://cdn.example.com/fallback.jpg" /></body></html>'
    );
    providerBuyHpeMock.mockResolvedValue(null);

    const row = await processPart('867982-B21', {});

    expect(row.PS_Title).toBe('Hot Swap Fan');
    expect(row.PSPhoto_Title).toBe('Hot Swap Fan');
    expect(row.BUY_URL).toBe('Product Not Found');
  });

  test('buy.hpe not-found SKUs produce Product Not Found URLs with empty titles', async () => {
    const module = await importModuleWithMocks();
    const { processPart } = module;

    const successSearchHtml =
      '<!doctype html><html><body><table><tr><th>Part Description</th><td>Standard Power Supply</td></tr></table></body></html>';
    getSearchHtmlMock.mockResolvedValue(successSearchHtml);
    getPhotoHtmlMock.mockResolvedValue('<html><body>Photo is not available</body></html>');
    providerBuyHpeMock.mockResolvedValue(null);

    const skus = [
      'P19766-B21',
      'P24487-B21',
      '867982-B21',
      '875545-001',
      '804326-B21',
      '873580-001',
      '780428-002',
      '743454-001',
      '804329-002'
    ];

    const rows = [];
    for (const sku of skus) {
      rows.push(await processPart(sku, {}));
    }

    for (const row of rows) {
      expect(row.BUY_URL).toBe('Product Not Found');
      expect(row.BUY_Title).toBe('');
    }

    const denylisted = rows.find((row) => row.PartNumber.startsWith('804329-002'));
    expect(denylisted.BUY_Error).toBe('CHECK MANUALLY');
    expect(denylisted.PartNumber).toContain('CHECK MANUALLY');
  });

  test('marks manual check when description is unavailable', async () => {
    const module = await importModuleWithMocks();
    const { processPart } = module;

    getSearchHtmlMock.mockResolvedValue(loadFixture('search_description_unavailable.html'));
    getPhotoHtmlMock.mockResolvedValue('<html><body>Product Description Not Available</body></html>');
    providerBuyHpeMock.mockResolvedValue({
      title: 'Some product',
      sku: '873580-001',
      url: 'https://buy.hpe.com/us/en/p/873580-001'
    });

    const row = await processPart('873580-001', {});

    expect(row.PartNumber).toBe('873580-001 (CHECK MANUALLY)');
    expect(row.PS_Error).toBe('CHECK MANUALLY');
    expect(row.PSPhoto_Error).toBe('CHECK MANUALLY');
    expect(row.BUY_Error).toBe('CHECK MANUALLY');
    expect(providerBuyHpeMock).not.toHaveBeenCalled();
  });
});

describe('main concurrency and logging', () => {
  const originalArgv = process.argv;
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    logSpy.mockRestore();
    jest.resetModules();
  });

  test('applies concurrency flag to p-limit and writes CSV outputs', async () => {
    jest.resetModules();
    const pLimitFactory = jest.fn((max) => (task) => task());
    jest.unstable_mockModule('p-limit', () => ({ default: pLimitFactory }));

    const searchHtml = '<html><body><table><tr><th>Part Description</th><td>Test Description</td></tr></table></body></html>';
    const photoHtml = '<html><body><p>Part Description : Test Photo</p><img src="/media/photos/test.jpg" /></body></html>';

    jest.unstable_mockModule('../src/fetch.js', () => ({
      getSearchHtml: jest.fn().mockResolvedValue(searchHtml),
      getPhotoHtml: jest.fn().mockResolvedValue(photoHtml)
    }));

    jest.unstable_mockModule('../src/providerBuyHpe.js', () => ({
      providerBuyHpe: jest.fn().mockResolvedValue({
        title: 'Buy Title',
        sku: 'SKU123',
        partNumber: 'SKU123',
        url: 'https://buy.hpe.com/us/en/p/SKU123',
        image: 'https://buy.hpe.com/media/sku123.jpg',
        category: 'Servers'
      }),
      default: jest.fn()
    }));

    const readFileMock = jest.fn().mockResolvedValue('P00000-B21\nP00001-B21\n');
    const writeFileMock = jest.fn();
    const mkdirMock = jest.fn();
    const appendFileMock = jest.fn().mockResolvedValue();

    jest.unstable_mockModule('node:fs/promises', () => ({
      __esModule: true,
      default: {
        readFile: readFileMock,
        writeFile: writeFileMock,
        mkdir: mkdirMock,
        appendFile: appendFileMock
      },
      readFile: readFileMock,
      writeFile: writeFileMock,
      mkdir: mkdirMock,
      appendFile: appendFileMock
    }));

    process.argv = ['node', 'cliProcessInputList.mjs', '--in', 'input.txt', '--out', 'output', '--concurrency', '2', '--log-json'];

    const module = await import('../src/cliProcessInputList.mjs');
    await module.main();

    expect(pLimitFactory).toHaveBeenCalledWith(2);
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    expect(mkdirMock).toHaveBeenCalled();
  });
});
