import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSearch } from '../src/parseSearch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('parseSearch', () => {
  test('extracts description, image, and BOM presence', () => {
    const html = loadFixture('search_ok.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'ProLiant DL380 Gen10 Fan Kit',
      bomPresent: true,
      imageUrl: 'https://partsurfer.hpe.com/assets/images/parts/511778-001_large.jpg'
    });
  });

  test('handles valid page without BOM', () => {
    const html = loadFixture('search_no_bom.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'System Board Assembly',
      bomPresent: false,
      imageUrl: 'https://partsurfer.hpe.com/images/placeholders/system-board.png'
    });
  });

  test('handles not-found pages', () => {
    const html = loadFixture('search_not_found.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: null,
      bomPresent: false,
      imageUrl: null
    });
  });
});
