import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePhoto } from '../src/parsePhoto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('parsePhoto', () => {
  test('extracts description and image URL', () => {
    const html = loadFixture('photo_ok.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      description: 'Optional Rack Rail Kit for ProLiant servers.',
      imageUrl: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg'
    });
  });

  test('returns null values for missing parts', () => {
    const html = loadFixture('photo_not_found.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      description: null,
      imageUrl: null
    });
  });
});
