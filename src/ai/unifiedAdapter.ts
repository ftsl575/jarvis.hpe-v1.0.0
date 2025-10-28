import { z } from 'zod';
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

const strictFactsRequestBaseSchema = z.object({
  sku: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  facts: z.array(z.unknown()).optional(),
  rules: z.array(z.string().trim().min(1)).optional()
});

export const strictFactsRequestSchema = strictFactsRequestBaseSchema
  .superRefine((value, ctx) => {
    const hasSku = typeof value.sku === 'string' && value.sku.length > 0;
    const hasQuery = typeof value.query === 'string' && value.query.length > 0;
    const hasFacts = Array.isArray(value.facts) && value.facts.length > 0;
    const hasRules = Array.isArray(value.rules) && value.rules.length > 0;
    if (!hasSku && !hasQuery && !hasFacts && !hasRules) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of sku, query, facts, or rules must be provided.'
      });
    }
  })
  .transform((value) => ({
    sku: value.sku,
    query: value.query,
    facts: value.facts ?? [],
    rules: value.rules ? value.rules.filter((rule) => rule.length > 0) : []
  }));

export type StrictFactsRequest = z.infer<typeof strictFactsRequestSchema>;

export interface StrictFactsResult {
  result: unknown;
  confidence: number;
  provenance: string[];
}

const strictFactsResponseSchema = z
  .object({
    result: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
    confidence: z
      .preprocess((value) => {
        if (value === undefined || value === null) {
          return undefined;
        }
        if (typeof value === 'string') {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return value;
      }, z.number().min(0).max(1))
      .optional(),
    provenance: z
      .preprocess((value) => {
        if (Array.isArray(value)) {
          return value.map((item) => String(item));
        }
        if (typeof value === 'string') {
          return [value];
        }
        return undefined;
      }, z.array(z.string()))
      .optional()
  })
  .strip();

function extractFactSources(facts: unknown[]): string[] {
  const sources = new Set<string>();
  facts.forEach((fact) => {
    if (fact && typeof fact === 'object') {
      const sourceValue = (fact as Record<string, unknown>).source;
      if (typeof sourceValue === 'string' && sourceValue.trim().length > 0) {
        sources.add(sourceValue.trim());
      }
    }
  });
  return Array.from(sources);
}

export function buildStrictFactsPrompt(input: StrictFactsRequest): string {
  const parts: string[] = [];
  parts.push('You are StrictFacts, a compliance validator. JSON only, no guessing, only facts provided.');
  parts.push('Respond strictly with JSON that matches {"result": <object|array>, "confidence": <0-1>, "provenance": [strings]}.');

  if (input.sku) {
    parts.push(`Primary SKU: ${input.sku}`);
  }
  if (input.query) {
    parts.push(`Query: ${input.query}`);
  }

  const factLines = input.facts.length
    ? input.facts.map((fact, index) => `- Fact ${index + 1}: ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`)
    : ['- None provided'];
  parts.push(`Facts (count: ${input.facts.length}):\n${factLines.join('\n')}`);

  const ruleLines = input.rules.length
    ? input.rules.map((rule, index) => `- Rule ${index + 1}: ${rule}`)
    : ['- No additional rules'];
  parts.push(`Rules (count: ${input.rules.length}):\n${ruleLines.join('\n')}`);

  parts.push('Output policy: JSON only, no guessing, only facts provided. If uncertain, set confidence to 0.');

  return parts.join('\n\n');
}

const STRICT_FACTS_META = {
  mode: 'strict-facts',
  temperature: 0,
  top_p: 1,
  max_tokens: 800,
  response_format: 'json'
};

function selectWeightedProvider(): ProviderKey {
  return Math.random() < 0.7 ? 'chatgpt' : 'deepseek';
}

function parseStrictFactsResponse(rawText: string, providerKey: ProviderKey) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Invalid JSON from ${providerKey}`);
  }
  const validation = strictFactsResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(`Invalid strict-facts payload from ${providerKey}`);
  }

  const payload = validation.data;
  const result = payload.result ?? {};
  const confidence = payload.confidence ?? 0;
  const provenance = payload.provenance ?? [];

  return { result, confidence, provenance };
}

async function attemptStrictFactsProvider(
  providerKey: ProviderKey,
  prompt: string,
  meta: Record<string, unknown>
): Promise<StrictFactsResult & { provider: ProviderKey }> {
  const provider = providers[providerKey];
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await provider.query({
        prompt,
        meta: { ...meta, provider: providerKey, attempt }
      });
      const parsed = parseStrictFactsResponse(response.text, providerKey);
      const provenance = Array.from(new Set([...parsed.provenance, providerKey]));
      return { ...parsed, provenance, provider: providerKey };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.error(`[strict-facts] ${providerKey} attempt ${attempt} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error(`strict-facts provider ${providerKey} failed`);
}

export async function strictFactsNormalize(input: StrictFactsRequest): Promise<StrictFactsResult> {
  const prompt = buildStrictFactsPrompt(input);
  const primary = selectWeightedProvider();
  const secondary: ProviderKey = primary === 'chatgpt' ? 'deepseek' : 'chatgpt';
  const meta = { ...STRICT_FACTS_META, sku: input.sku, facts: input.facts.length, rules: input.rules.length };

  const factSources = extractFactSources(input.facts);

  try {
    const response = await attemptStrictFactsProvider(primary, prompt, meta);
    const provenance = Array.from(new Set([...factSources, ...response.provenance]));
    return { result: response.result, confidence: response.confidence, provenance };
  } catch (primaryError) {
    // eslint-disable-next-line no-console
    console.error(`[strict-facts] primary provider ${primary} failed after retries`, primaryError);
  }

  const fallbackResponse = await attemptStrictFactsProvider(secondary, prompt, meta);
  const provenance = Array.from(new Set([...factSources, ...fallbackResponse.provenance]));
  return { result: fallbackResponse.result, confidence: fallbackResponse.confidence, provenance };
}
