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
      description: 'Cooling Fan Assembly',
      bomPresent: true,
      imageUrl: '/images/fan.jpg'
    });
  });

  test('handles valid page without BOM', () => {
    const html = loadFixture('search_no_bom.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'System board',
      bomPresent: false,
      imageUrl: null
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
