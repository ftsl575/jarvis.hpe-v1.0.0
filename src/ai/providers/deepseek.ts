import { IAIProvider, ProviderHealth, ProviderInput, ProviderResponse } from './IAIProvider';

const MOCK_WARNING =
  'DEEPSEEK_API_KEY missing. Returning mocked response. Configure the key to reach the real API.';

export class DeepSeekProvider implements IAIProvider {
  private readonly apiKey: string | undefined;

  constructor(apiKey: string | undefined = process.env.DEEPSEEK_API_KEY) {
    this.apiKey = apiKey;
  }

  async query(input: ProviderInput): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return {
        text: `[mocked deepseek] ${input.prompt}`
      };
    }

    // TODO: integrate with the real DeepSeek API when credentials are available.
    return {
      text: `[deepseek] ${input.prompt}`
    };
  }

  async *stream(input: { prompt: string }): AsyncIterable<string> {
    if (!this.apiKey) {
      yield `[mocked deepseek stream] ${input.prompt}`;
      return;
    }

    // TODO: stream data from DeepSeek once the API contract is finalised.
    yield `[deepseek stream] ${input.prompt}`;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return { ok: true, details: MOCK_WARNING };
    }

    return { ok: true };
  }
}

export const deepSeekProvider = new DeepSeekProvider();
