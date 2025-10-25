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
      title: 'Optional Rack Rail Kit for ProLiant servers.',
      imageUrl: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
      notFound: false
    });
  });

  test('ignores placeholder images', () => {
    const html = loadFixture('photo_missing.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      title: 'Optional Rack Rail Kit for ProLiant servers.',
      imageUrl: null,
      notFound: false
    });
  });

  test('returns null values for missing parts', () => {
    const html = loadFixture('photo_not_found.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      title: null,
      imageUrl: null,
      notFound: true
    });
  });

  test('uses caption or alt text when head title is generic', () => {
    const html = loadFixture('photo_caption.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      title: 'High-speed cooling fan module',
      imageUrl: 'https://partsurfer.hpe.com/media/photos/fan123_large.jpg',
      notFound: false
    });
  });

  test('prefers Part Description text when present', () => {
    const html = loadFixture('photo_part_description.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      title: 'HPE 64GB 2Rx4 PC4-2933Y-R Smart Kit',
      imageUrl: 'https://partsurfer.hpe.com/media/photos/memory_kit.jpg',
      notFound: false
    });
  });

  test('marks description unavailable as not found', () => {
    const html = loadFixture('photo_description_unavailable.html');
    const result = parsePhoto(html);

    expect(result).toEqual({
      title: null,
      imageUrl: null,
      notFound: true
    });
  });
});
