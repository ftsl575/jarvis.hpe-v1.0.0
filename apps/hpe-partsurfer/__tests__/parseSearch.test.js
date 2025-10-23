const fs = require('fs');
const path = require('path');
const parseSearch = require('../src/parseSearch');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('parseSearch', () => {
  it('extracts description, image and BOM status', () => {
    const html = loadFixture('search_with_bom.html');
    const result = parseSearch(html);
    expect(result).toEqual({
      sourcePage: 'Search',
      status: 'ok',
      description: 'HPE Cable Kit',
      imageUrl: 'https://partsurfer.hpe.com/images/cable.jpg'
    });
  });

  it('returns no_bom when description is present but no BOM rows', () => {
    const html = loadFixture('search_no_bom.html');
    const result = parseSearch(html);
    expect(result.status).toBe('no_bom');
    expect(result.description).toBe('HPE Enclosure');
  });

  it('returns not_found when no description or BOM exists', () => {
    const html = loadFixture('search_not_found.html');
    const result = parseSearch(html);
    expect(result.status).toBe('not_found');
    expect(result.description).toBe('');
  });
});
