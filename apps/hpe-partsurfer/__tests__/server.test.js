import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

const runForPartMock = jest.fn();

jest.unstable_mockModule('../src/runner.js', () => ({
  runForPart: runForPartMock
}));

const { default: app } = await import('../src/server.js');

describe('server', () => {
  beforeEach(() => {
    runForPartMock.mockReset();
  });

  test('GET /health returns ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('GET /api/part validates query parameter', async () => {
    const response = await request(app).get('/api/part');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid part number' });
  });

  test('GET /api/part returns runner output', async () => {
    const row = {
      part_number: '511778-001',
      description: 'Cooling Fan Assembly',
      image_url: '/images/fan.jpg',
      source_page: 'Search',
      status: 'ok'
    };
    runForPartMock.mockResolvedValue(row);

    const response = await request(app).get('/api/part').query({ pn: '511778-001' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(row);
    expect(runForPartMock).toHaveBeenCalledWith('511778-001', { live: false });
  });

  test('GET /api/part maps failures to 502', async () => {
    runForPartMock.mockRejectedValue(new Error('Network error'));

    const response = await request(app).get('/api/part').query({ pn: '511778-001' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Network error' });
  });

  test('GET /api/part honors live query', async () => {
    const row = { status: 'ok' };
    runForPartMock.mockResolvedValue(row);

    const response = await request(app).get('/api/part').query({ pn: '511778-001', live: '1' });

    expect(response.status).toBe(200);
    expect(runForPartMock).toHaveBeenCalledWith('511778-001', { live: true });
  });

  test('GET /api/part maps live disabled to 503', async () => {
    const error = new Error('Live mode disabled');
    error.code = 'LIVE_DISABLED';
    runForPartMock.mockRejectedValue(error);

    const response = await request(app).get('/api/part').query({ pn: '511778-001' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Live mode disabled' });
  });
});
