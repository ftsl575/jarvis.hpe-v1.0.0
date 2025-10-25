import { IAIProvider, ProviderHealth, ProviderInput, ProviderResponse } from './IAIProvider';

const MOCK_WARNING =
  'CHATGPT_API_KEY missing. Returning mocked response. Configure the key to reach the real API.';

export class ChatGPTProvider implements IAIProvider {
  private readonly apiKey: string | undefined;

  constructor(apiKey: string | undefined = process.env.CHATGPT_API_KEY) {
    this.apiKey = apiKey;
  }

  async query(input: ProviderInput): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return {
        text: `[mocked chatgpt] ${input.prompt}`
      };
    }

    // TODO: integrate with the real ChatGPT API when credentials are available.
    return {
      text: `[chatgpt] ${input.prompt}`
    };
  }

  async *stream(input: { prompt: string }): AsyncIterable<string> {
    if (!this.apiKey) {
      yield `[mocked chatgpt stream] ${input.prompt}`;
      return;
    }

    // TODO: stream data from ChatGPT once the API contract is finalised.
    yield `[chatgpt stream] ${input.prompt}`;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return { ok: true, details: MOCK_WARNING };
    }

    return { ok: true };
  }
}

export const chatGPTProvider = new ChatGPTProvider();
