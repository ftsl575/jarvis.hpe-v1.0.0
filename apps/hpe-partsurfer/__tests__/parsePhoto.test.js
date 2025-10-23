const fs = require('fs');
const path = require('path');
const parsePhoto = require('../src/parsePhoto');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('parsePhoto', () => {
  it('extracts description and image', () => {
    const html = loadFixture('photo_success.html');
    const result = parsePhoto(html);
    expect(result).toEqual({
      sourcePage: 'Photo',
      status: 'ok',
      description: 'HPE Rack Rail Kit',
      imageUrl: 'https://partsurfer.hpe.com/images/rail.jpg'
    });
  });

  it('returns not_found when description missing', () => {
    const html = loadFixture('photo_not_found.html');
    const result = parsePhoto(html);
    expect(result.status).toBe('not_found');
    expect(result.description).toBe('');
  });
});
