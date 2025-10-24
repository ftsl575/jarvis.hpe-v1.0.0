import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nock from 'nock';
import { runBatch, runForPart } from '../src/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
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
  test('returns search result when BOM is present', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, loadFixture('search_ok.html'));

    const result = await runForPart('511778-001', { live: true });

    expect(result).toEqual({
      part_number: '511778-001',
      description: 'ProLiant DL380 Gen10 Fan Kit',
      image_url: 'https://partsurfer.hpe.com/assets/images/parts/511778-001_large.jpg',
      source_page: 'Search',
      status: 'ok'
    });
  });

  test('falls back to photo when search lacks BOM', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '123456-001' })
      .reply(200, loadFixture('search_no_bom.html'))
      .get('/ShowPhoto.aspx')
      .query({ partnumber: '123456-001' })
      .reply(200, loadFixture('photo_ok.html'));

    const result = await runForPart('123456-001', { live: true });

    expect(result).toEqual({
      part_number: '123456-001',
      description: 'System Board Assembly',
      image_url: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
      source_page: 'Search',
      status: 'no_bom'
    });
  });

  test('returns not_found when neither source yields data', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '000000-001' })
      .reply(200, loadFixture('search_not_found.html'))
      .get('/ShowPhoto.aspx')
      .query({ partnumber: '000000-001' })
      .reply(200, loadFixture('photo_not_found.html'));

    const result = await runForPart('000000-001', { live: true });

    expect(result).toEqual({
      part_number: '000000-001',
      description: null,
      image_url: null,
      source_page: 'Search',
      status: 'not_found'
    });
  });

  test('uses photo mode for accessory parts', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, loadFixture('photo_ok.html'));

    const result = await runForPart('af573a', { live: true });

    expect(result).toEqual({
      part_number: 'AF573A',
      description: 'Optional Rack Rail Kit for ProLiant servers.',
      image_url: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
      source_page: 'Photo',
      status: 'ok'
    });
  });
});

describe('runBatch', () => {
  test('processes parts sequentially', async () => {
    nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, loadFixture('search_ok.html'))
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, loadFixture('photo_ok.html'));

    const rows = await runBatch(['511778-001', 'AF573A'], { live: true, throttleMs: 0 });

    expect(rows).toEqual([
      {
        part_number: '511778-001',
        description: 'ProLiant DL380 Gen10 Fan Kit',
        image_url: 'https://partsurfer.hpe.com/assets/images/parts/511778-001_large.jpg',
        source_page: 'Search',
        status: 'ok'
      },
      {
        part_number: 'AF573A',
        description: 'Optional Rack Rail Kit for ProLiant servers.',
        image_url: 'https://partsurfer.hpe.com/media/photos/af573a_large.jpg',
        source_page: 'Photo',
        status: 'ok'
      }
    ]);
  });
});
