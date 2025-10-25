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
  test('parses OKN page with BOM items', () => {
    const html = loadFixture('search_okn.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'HPE ProLiant OKN Fan Module',
      category: 'Cooling Modules',
      availability: null,
      imageUrl: 'https://partsurfer.hpe.com/media/photos/okn1234a_large.jpg',
      bomItems: [
        { partNumber: 'OKN2001', description: 'Primary Fan Cartridge' },
        { partNumber: 'OKN2002', description: 'Secondary Airflow Baffle' }
      ],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null,
      multipleResults: false,
      notFound: false,
      bomSectionFound: true,
      bomUnavailable: false,
      manualCheck: false
    });
  });

  test('extracts description, category, and availability from standard detail table', () => {
    const html = loadFixture('search_875545.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'HPE System I/O Board',
      category: 'System Boards',
      availability: 'Obsolete',
      imageUrl: 'https://partsurfer.hpe.com/media/photos/875545-001.jpg',
      bomItems: [],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null,
      multipleResults: false,
      notFound: false,
      bomSectionFound: false,
      bomUnavailable: false,
      manualCheck: false
    });
  });

  test('detects multi-match SKU search results', () => {
    const html = loadFixture('search_sku.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: null,
      category: null,
      availability: null,
      imageUrl: null,
      bomItems: [],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null,
      multipleResults: true,
      notFound: false,
      bomSectionFound: false,
      bomUnavailable: false,
      manualCheck: false
    });
  });

  test('captures replacement relationships', () => {
    const html = loadFixture('search_replaced.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'Legacy Power Supply Unit',
      category: 'Power Supplies',
      availability: null,
      imageUrl: 'https://partsurfer.hpe.com/images/parts/legacy_supply.png',
      bomItems: [],
      compatibleProducts: [],
      replacedBy: 'P04567-001',
      substitute: 'P04568-001',
      multipleResults: false,
      notFound: false,
      bomSectionFound: true,
      bomUnavailable: true,
      manualCheck: false
    });
  });

  test('collects compatible products', () => {
    const html = loadFixture('search_compat.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'Rack Mounting Kit',
      category: 'Rack Accessories',
      availability: null,
      imageUrl: null,
      bomItems: [],
      compatibleProducts: [
        { partNumber: 'DL380-G10', description: 'ProLiant DL380 Gen10 Server' },
        { partNumber: 'DL360-G10', description: 'ProLiant DL360 Gen10 Server' },
        { partNumber: 'ML350-G10', description: 'ProLiant ML350 Gen10 Server' }
      ],
      replacedBy: null,
      substitute: null,
      multipleResults: false,
      notFound: false,
      bomSectionFound: false,
      bomUnavailable: false,
      manualCheck: false
    });
  });

  test('prefers details table values for description, category, and availability', () => {
    const html = loadFixture('search_details_table.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: 'System Board Assembly',
      category: 'Server Components',
      availability: 'Replaced (P12345-002)',
      imageUrl: null,
      bomItems: [],
      compatibleProducts: [],
      replacedBy: 'P12345-002',
      substitute: null,
      multipleResults: false,
      notFound: false,
      bomSectionFound: false,
      bomUnavailable: false,
      manualCheck: false
    });
  });

  test('marks manual check when description is unavailable placeholder', () => {
    const html = loadFixture('search_description_unavailable.html');
    const result = parseSearch(html);

    expect(result).toEqual({
      description: null,
      category: 'Server Options',
      availability: 'Available',
      imageUrl: null,
      bomItems: [],
      compatibleProducts: [],
      replacedBy: null,
      substitute: null,
      multipleResults: false,
      notFound: false,
      bomSectionFound: false,
      bomUnavailable: false,
      manualCheck: true
    });
  });
});
