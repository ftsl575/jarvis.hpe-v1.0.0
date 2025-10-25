import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nock from 'nock';
import { runBatch, runForPart } from '../src/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

async function axiosFetch(url) {
  const response = await axios.get(url.toString(), { responseType: 'text', proxy: false });
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    url: response.request.res.responseUrl,
    text: async () => response.data
  };
}

beforeAll(() => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
});

beforeEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

describe('runForPart', () => {
  test('returns BOM data for OKN search', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: 'OKN1234-001' })
      .reply(200, loadFixture('search_okn.html'));

    const result = await runForPart('OKN1234-001', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'OKN1234-001',
      description: 'HPE ProLiant OKN Fan Module',
      category: 'Cooling Modules',
      image_url: 'https://partsurfer.hpe.com/media/photos/okn1234a_large.jpg',
      source_page: 'Search',
      status: 'ok',
      replaced_by: null,
      substitute: null,
      bom_count: 2,
      compatible_count: 0
    });
  });

  test('exposes replacement information when BOM is unavailable', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: 'P04500-001' })
      .reply(200, loadFixture('search_replaced.html'));

    const result = await runForPart('P04500-001', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'P04500-001',
      description: 'Legacy Power Supply Unit',
      category: 'Power Supplies',
      image_url: 'https://partsurfer.hpe.com/images/parts/legacy_supply.png',
      source_page: 'Search',
      status: 'no_bom',
      replaced_by: 'P04567-001',
      substitute: 'P04568-001',
      bom_count: 0,
      compatible_count: 0
    });
  });

  test('flags multi-match SKU results', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: 'Q1A23-001' })
      .reply(200, loadFixture('search_sku.html'));

    const result = await runForPart('Q1A23-001', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'Q1A23-001',
      description: null,
      category: null,
      image_url: null,
      source_page: 'Search',
      status: 'multi_match',
      replaced_by: null,
      substitute: null,
      bom_count: 0,
      compatible_count: 0
    });
  });

  test('counts compatible products', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: 'RACKKIT-123' })
      .reply(200, loadFixture('search_compat.html'));

    const result = await runForPart('RACKKIT-123', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'RACKKIT-123',
      description: 'Rack Mounting Kit',
      category: 'Rack Accessories',
      image_url: null,
      source_page: 'Search',
      status: 'no_bom',
      replaced_by: null,
      substitute: null,
      bom_count: 0,
      compatible_count: 3
    });
  });

  test('returns not_found when no details exist', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '000000-001' })
      .reply(200, loadFixture('search_not_found.html'))
      .get('/ShowPhoto.aspx')
      .query({ partnumber: '000000-001' })
      .reply(200, loadFixture('photo_not_found.html'));

    const result = await runForPart('000000-001', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: '000000-001',
      description: null,
      category: null,
      image_url: null,
      source_page: 'Search',
      status: 'not_found',
      replaced_by: null,
      substitute: null,
      bom_count: 0,
      compatible_count: 0
    });
  });

  test('uses photo mode for accessory parts', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, loadFixture('photo_ok.html'));

    const result = await runForPart('af573a', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'AF573A',
      description: 'Optional Rack Rail Kit for ProLiant servers.',
      category: null,
      image_url: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
      source_page: 'Photo',
      status: 'ok',
      replaced_by: null,
      substitute: null,
      bom_count: 0,
      compatible_count: 0
    });
  });

  test('performs live search fallback when photo is missing', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF9999A' })
      .reply(200, loadFixture('photo_not_found.html'))
      .get('/Search.aspx')
      .query({ SearchText: 'AF9999A' })
      .reply(200, loadFixture('search_accessory.html'));

    const result = await runForPart('af9999a', { live: true, fetch: axiosFetch });

    expect(result).toEqual({
      part_number: 'AF9999A',
      description: 'Optional Rack Rail Kit for ProLiant servers.',
      category: 'Rack Rail Kits',
      image_url: null,
      source_page: 'Photo',
      status: 'ok',
      replaced_by: null,
      substitute: null,
      bom_count: 0,
      compatible_count: 0
    });
  });
});

describe('runBatch', () => {
  test('processes parts sequentially', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: 'OKN1234-001' })
      .reply(200, loadFixture('search_okn.html'))
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, loadFixture('photo_ok.html'));

    const rows = await runBatch(['OKN1234-001', 'AF573A'], { live: true, throttleMs: 0, fetch: axiosFetch });

    expect(rows).toEqual([
      {
        part_number: 'OKN1234-001',
        description: 'HPE ProLiant OKN Fan Module',
        category: 'Cooling Modules',
        image_url: 'https://partsurfer.hpe.com/media/photos/okn1234a_large.jpg',
        source_page: 'Search',
        status: 'ok',
        replaced_by: null,
        substitute: null,
        bom_count: 2,
        compatible_count: 0
      },
      {
        part_number: 'AF573A',
        description: 'Optional Rack Rail Kit for ProLiant servers.',
        category: null,
        image_url: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
        source_page: 'Photo',
        status: 'ok',
        replaced_by: null,
        substitute: null,
        bom_count: 0,
        compatible_count: 0
      }
    ]);
  });
});
