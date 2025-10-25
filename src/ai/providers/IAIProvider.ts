export interface ProviderInput {
  prompt: string;
  stream?: boolean;
  meta?: Record<string, unknown>;
}

export interface ProviderResponse {
  text: string;
}

export interface ProviderHealth {
  ok: boolean;
  details?: string;
}

export interface IAIProvider {
  query(input: ProviderInput): Promise<ProviderResponse>;
  stream?(input: { prompt: string }): AsyncIterable<string>;
  healthCheck(): Promise<ProviderHealth>;
}
