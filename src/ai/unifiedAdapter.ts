import { chatGPTProvider } from './providers/chatgpt';
import { deepSeekProvider } from './providers/deepseek';
import { IAIProvider, ProviderHealth, ProviderInput, ProviderResponse } from './providers/IAIProvider';

type ProviderKey = 'chatgpt' | 'deepseek';

const providers: Record<ProviderKey, IAIProvider> = {
  chatgpt: chatGPTProvider,
  deepseek: deepSeekProvider
};

export interface UnifiedQueryInput extends ProviderInput {
  meta?: ProviderInput['meta'] & { provider?: ProviderKey };
}

export async function unifiedQuery(input: UnifiedQueryInput): Promise<ProviderResponse> {
  const providerKey = (input.meta?.provider as ProviderKey | undefined) ?? 'chatgpt';
  const provider = providers[providerKey] ?? providers.chatgpt;
  return provider.query(input);
}

export function getProvider(provider?: string): IAIProvider {
  const key = (provider?.toLowerCase() ?? 'chatgpt') as ProviderKey;
  return providers[key] ?? providers.chatgpt;
}

function formatHealthError(error: unknown): ProviderHealth {
  const details = error instanceof Error ? error.message : String(error);
  return { ok: false, details };
}

export async function unifiedHealthCheck(): Promise<Record<string, Awaited<ReturnType<IAIProvider['healthCheck']>>>> {
  const entries = await Promise.all(
    (Object.keys(providers) as ProviderKey[]).map(async (key) => {
      try {
        const result = await providers[key].healthCheck();
        return [key, result] as const;
      } catch (error) {
        return [key, formatHealthError(error)] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}
