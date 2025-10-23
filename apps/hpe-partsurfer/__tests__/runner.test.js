const path = require('path');
const fs = require('fs');
const nock = require('nock');
const { runForPart } = require('../src/runner');
const { BASE_URL } = require('../src/fetch');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('runner', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('returns search results when BOM is available', async () => {
    const searchHtml = loadFixture('search_with_bom.html');
    nock(BASE_URL)
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, searchHtml);

    const result = await runForPart('511778-001');
    expect(result).toEqual({
      part_number: '511778-001',
      description: 'HPE Cable Kit',
      image_url: 'https://partsurfer.hpe.com/images/cable.jpg',
      source_page: 'Search',
      status: 'ok'
    });
  });

  it('falls back to photo mode when search lacks BOM for -001 parts', async () => {
    const searchHtml = loadFixture('search_no_bom.html');
    const photoHtml = loadFixture('photo_success.html');

    nock(BASE_URL)
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, searchHtml);
    nock(BASE_URL)
      .get('/ShowPhoto.aspx')
      .query({ partnumber: '511778-001' })
      .reply(200, photoHtml);

    const result = await runForPart('511778-001');
    expect(result).toEqual({
      part_number: '511778-001',
      description: 'HPE Rack Rail Kit',
      image_url: 'https://partsurfer.hpe.com/images/rail.jpg',
      source_page: 'Photo',
      status: 'ok'
    });
  });

  it('returns no_bom for search-only parts even without BOM', async () => {
    const searchHtml = loadFixture('search_no_bom.html');
    nock(BASE_URL)
      .get('/Search.aspx')
      .query({ SearchText: '123456-B21' })
      .reply(200, searchHtml);

    const result = await runForPart('123456-B21');
    expect(result.status).toBe('no_bom');
    expect(result.source_page).toBe('Search');
  });

  it('uses photo mode for photo-only parts', async () => {
    const photoHtml = loadFixture('photo_success.html');
    nock(BASE_URL)
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, photoHtml);

    const result = await runForPart('AF573A');
    expect(result.source_page).toBe('Photo');
    expect(result.status).toBe('ok');
  });
});
