import { jest } from '@jest/globals';

const aggregateModuleUrl = new URL('../aggregateMultiSource.js', import.meta.url);
const aggregateModulePath = aggregateModuleUrl.href;
const fetchModulePath = new URL('./fetch.js', aggregateModuleUrl).pathname;
const parseSearchModulePath = new URL('./parseSearch.js', aggregateModuleUrl).pathname;
const parsePhotoModulePath = new URL('./parsePhoto.js', aggregateModuleUrl).pathname;
const fetchBuyModulePath = new URL('./fetchBuyHpe.js', aggregateModuleUrl).pathname;
const parseBuyModulePath = new URL('./parseBuyHpe.js', aggregateModuleUrl).pathname;

describe('aggregateMultiSource', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('aggregates PartSurfer and Photo data when available', async () => {
    const searchData = {
      description: 'Server component',
      category: 'Servers',
      imageUrl: 'https://example.test/image.png',
      bomItems: ['ITEM1'],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null
    };
    const photoData = {
      description: 'Photo caption',
      imageUrl: 'https://example.test/photo.png'
    };

    jest.unstable_mockModule(fetchModulePath, () => ({
      getSearchHtml: jest.fn(async () => '<html>search</html>'),
      getPhotoHtml: jest.fn(async () => '<html>photo</html>')
    }));

    jest.unstable_mockModule(parseSearchModulePath, () => ({
      parseSearch: jest.fn(() => searchData)
    }));

    jest.unstable_mockModule(parsePhotoModulePath, () => ({
      parsePhoto: jest.fn(() => photoData)
    }));

    const { aggregateMultiSource, NO_DATA_AT_THIS_SOURCE } = await import(aggregateModulePath);

    const results = await aggregateMultiSource(['pn-100']);
    expect(results).toHaveLength(1);

    const [result] = results;
    expect(result.partNumber).toBe('PN-100');
    expect(result.partsurfer).toBe(JSON.stringify(searchData));
    expect(result.partsurferPhoto).toBe(JSON.stringify(photoData));
    expect(result.buyHpe).toBe(NO_DATA_AT_THIS_SOURCE);
  });

  test('includes Buy.HPE data when integrations are available', async () => {
    const buyFetchMock = jest.fn(async () => '<html>buy</html>');
    const buyParsed = {
      price: '$199.99',
      url: 'https://buy.hpe.com/item/PN200',
      availability: 'in_stock'
    };

    jest.unstable_mockModule(fetchModulePath, () => ({
      getSearchHtml: jest.fn(async () => '<html>search</html>'),
      getPhotoHtml: jest.fn(async () => '<html>photo</html>')
    }));

    jest.unstable_mockModule(parseSearchModulePath, () => ({
      parseSearch: jest.fn(() => ({
        description: null,
        category: null,
        imageUrl: null,
        bomItems: [],
        compatibleProducts: [],
        replacedBy: null,
        substitute: null
      }))
    }));

    jest.unstable_mockModule(parsePhotoModulePath, () => ({
      parsePhoto: jest.fn(() => ({ description: null, imageUrl: null }))
    }));

    jest.unstable_mockModule(fetchBuyModulePath, () => ({
      __esModule: true,
      fetchBuyHpe: buyFetchMock
    }));

    const parseBuyMock = jest.fn(async () => buyParsed);
    jest.unstable_mockModule(parseBuyModulePath, () => ({
      __esModule: true,
      parseBuyHpe: parseBuyMock
    }));

    const { aggregateMultiSource, NO_DATA_AT_THIS_SOURCE } = await import(aggregateModulePath);

    const options = { live: true, region: 'emea' };
    const results = await aggregateMultiSource(['pn200'], options);
    expect(results).toHaveLength(1);

    const [result] = results;
    expect(result.partNumber).toBe('PN200');
    expect(result.partsurfer).toBe(NO_DATA_AT_THIS_SOURCE);
    expect(result.partsurferPhoto).toBe(NO_DATA_AT_THIS_SOURCE);
    expect(result.buyHpe).toBe(JSON.stringify(buyParsed));
    expect(buyFetchMock).toHaveBeenCalledWith('PN200', expect.objectContaining(options));
    expect(parseBuyMock).toHaveBeenCalledWith('<html>buy</html>', 'PN200', expect.objectContaining(options));
  });
});
