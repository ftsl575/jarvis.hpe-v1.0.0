import request from 'supertest';
import createApp from '../src/app';
import { chatGPTProvider } from '../src/ai/providers/chatgpt';
import { deepSeekProvider } from '../src/ai/providers/deepseek';
import { buildStrictFactsPrompt, strictFactsNormalize } from '../src/ai/unifiedAdapter';

describe('Strict-facts parts normalization', () => {
  const app = createApp();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produces deterministic JSON payloads without guesses through the HTTP endpoint', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.2);
    const querySpy = jest.spyOn(chatGPTProvider, 'query').mockResolvedValue({
      text: JSON.stringify({
        result: { sku: 'HDD-001', attributes: { capacity: '1TB' } },
        confidence: 0.92,
        provenance: ['facts.csv']
      })
    });

    const payload = {
      sku: 'HDD-001',
      query: 'Normalize HDD attributes',
      facts: [{ field: 'capacity', value: '1TB', source: 'partsurfer.csv' }],
      rules: ['Do not infer missing fields.']
    };

    const response = await request(app).post('/v3/parts/normalize/strict').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: { sku: 'HDD-001', attributes: { capacity: '1TB' } },
      confidence: 0.92,
      mode: 'strict-facts'
    });
    expect(response.body.provenance).toEqual(expect.arrayContaining(['facts.csv', 'chatgpt', 'partsurfer.csv']));

    expect(querySpy).toHaveBeenCalledTimes(1);
    const providerInput = querySpy.mock.calls[0][0];
    expect(providerInput.meta).toMatchObject({
      mode: 'strict-facts',
      temperature: 0,
      top_p: 1,
      response_format: 'json'
    });
    expect(providerInput.prompt).toContain('JSON only, no guessing, only facts provided');
    expect(providerInput.prompt).toContain('Facts (count: 1)');
  });

  it('retries invalid JSON once before falling back to the secondary provider', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const chatSpy = jest
      .spyOn(chatGPTProvider, 'query')
      .mockResolvedValueOnce({ text: 'not-json' })
      .mockRejectedValueOnce(new Error('network error'));

    const deepSpy = jest.spyOn(deepSeekProvider, 'query').mockResolvedValue({
      text: JSON.stringify({ result: { sku: 'FALLBACK' }, confidence: 0.6 })
    });

    const result = await strictFactsNormalize({
      sku: undefined,
      query: 'Check fallback behaviour',
      facts: [{ sku: 'ABC' }],
      rules: [] as string[]
    });

    expect(result.result).toEqual({ sku: 'FALLBACK' });
    expect(result.provenance).toContain('deepseek');
    expect(chatSpy).toHaveBeenCalledTimes(2);
    expect(deepSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('parses provider payloads and combines provenance sources deterministically', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.95);

    jest.spyOn(deepSeekProvider, 'query').mockResolvedValue({
      text: JSON.stringify({
        result: { sku: 'ZZ-999', notes: 'verified' },
        confidence: '0.75',
        provenance: 'deep-catalogue'
      })
    });

    const input = {
      sku: 'ZZ-999',
      query: undefined,
      facts: [
        { field: 'capacity', value: '12TB', source: 'matrix.csv' },
        { field: 'rpm', value: '7200' }
      ],
      rules: [] as string[]
    };

    const prompt = buildStrictFactsPrompt(input);
    expect(prompt).toContain('Facts (count: 2)');

    const result = await strictFactsNormalize(input);
    expect(result.confidence).toBeCloseTo(0.75);
    expect(result.provenance).toEqual(expect.arrayContaining(['matrix.csv', 'deep-catalogue', 'deepseek']));
  });
});
