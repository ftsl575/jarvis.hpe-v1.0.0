const request = require('supertest');
const app = require('../src/server');
const { evaluatePartNumber } = require('../src/index');

describe('HTTP API', () => {
  test('GET /health returns ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('GET /api/part responds with normalized data for valid part number', async () => {
    const partNumber = '511778-001';
    const expected = evaluatePartNumber(partNumber);

    const response = await request(app).get('/api/part').query({ pn: partNumber });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      input: expected.input,
      part_number: expected.partNumber,
      status: expected.status
    });
  });

  test('GET /api/part without part number returns 400', async () => {
    const response = await request(app).get('/api/part');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid part number',
      input: undefined
    });
  });

  test('GET /api/part with invalid part number mirrors evaluator response', async () => {
    const partNumber = 'bad';
    const expected = evaluatePartNumber(partNumber);

    const response = await request(app).get('/api/part').query({ pn: partNumber });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      input: expected.input,
      part_number: expected.partNumber,
      status: expected.status
    });
  });
});
