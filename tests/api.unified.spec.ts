import request from 'supertest';
import createApp from '../src/app';
import { chatGPTProvider } from '../src/ai/providers/chatgpt';

describe('Unified AI API', () => {
  const app = createApp();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a response from the default provider', async () => {
    const response = await request(app).post('/v3/ai/unified').send({ prompt: 'Hello' });
    expect(response.status).toBe(200);
    expect(response.body.text).toContain('mocked chatgpt');
  });

  it('selects deepseek when provider is specified', async () => {
    const response = await request(app)
      .post('/v3/ai/unified')
      .send({ prompt: 'Hello', provider: 'deepseek' });
    expect(response.status).toBe(200);
    expect(response.body.text).toContain('mocked deepseek');
  });

  it('exposes health check information', async () => {
    const response = await request(app).get('/v3/ai/unified/health');
    expect(response.status).toBe(200);
    expect(response.body.providers.chatgpt.ok).toBe(true);
    expect(response.body.providers.deepseek.ok).toBe(true);
  });

  it('reports a provider as unhealthy when its health check fails', async () => {
    jest.spyOn(chatGPTProvider, 'healthCheck').mockRejectedValueOnce(new Error('temporary outage'));

    const response = await request(app).get('/v3/ai/unified/health');

    expect(response.status).toBe(200);
    expect(response.body.providers.chatgpt.ok).toBe(false);
    expect(response.body.providers.chatgpt.details).toContain('temporary outage');
  });
});
