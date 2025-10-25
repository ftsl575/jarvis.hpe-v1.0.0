import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

const baseModule = await import('../src/cliProcessInputList.mjs');
const {
  CSV_HEADERS,
  buildCsvContent,
  toCsvValue,
  allProvidersFailed,
  shouldAutoCorrect
} = baseModule;

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
});
