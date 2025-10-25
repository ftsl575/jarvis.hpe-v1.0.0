import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import axios from 'axios';
import nock from 'nock';
import { getPhotoHtml, getSearchHtml } from '../src/fetch.js';

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

describe('fetch module', () => {
  test('getSearchHtml requests Search.aspx with SearchText parameter', async () => {
    const scope = nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, '<html>search</html>');

    const html = await getSearchHtml('511778-001', { live: true });
    expect(html).toBe('<html>search</html>');
    expect(scope.isDone()).toBe(true);
  });

  test('getPhotoHtml requests ShowPhoto.aspx with partnumber parameter', async () => {
    const scope = nock('https://partsurfer.hpe.com')
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, '<html>photo</html>');

    const html = await getPhotoHtml('AF573A', { live: true, fetch: axiosFetch });
    expect(html).toBe('<html>photo</html>');
    expect(scope.isDone()).toBe(true);
  });

  test('retries transient failures', async () => {
    const scope = nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '123456-001' })
      .reply(500)
      .get('/Search.aspx')
      .query({ SearchText: '123456-001' })
      .reply(200, '<html>ok</html>');

    const html = await getSearchHtml('123456-001', { live: true });
    expect(html).toBe('<html>ok</html>');
    expect(scope.isDone()).toBe(true);
  });

  test('throws when live mode disabled without override', async () => {
    await expect(getSearchHtml('511778-001')).rejects.toMatchObject({ code: 'LIVE_DISABLED' });
  });

  test('opts.live=true bypasses default disabled live mode', async () => {
    const scope = nock('https://partsurfer.hpe.com')
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, '<html>ok</html>');

    const html = await getSearchHtml('511778-001', { live: true });
    expect(html).toBe('<html>ok</html>');
    expect(scope.isDone()).toBe(true);
  });
});
