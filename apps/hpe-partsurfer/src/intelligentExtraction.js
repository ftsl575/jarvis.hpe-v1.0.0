import { normalizeText } from './normalize.js';
import { sanitizeEvidenceSnippet } from '../utils/normalizeText.js';
import runLlmFilters from '../llm/index.js';
import { log } from './logger.js';

const MAX_SNIPPET_LENGTH = 20_000;
const SCRIPT_PATTERN = /<script[\s\S]*?<\/script>/gi;
const STYLE_PATTERN = /<style[\s\S]*?<\/style>/gi;

function sanitizeSnippet(html) {
  if (typeof html !== 'string') {
    return '';
  }
  const trimmed = html.trim();
  if (!trimmed) {
    return '';
  }
  const withoutScripts = trimmed.replace(SCRIPT_PATTERN, ' ');
  const withoutStyles = withoutScripts.replace(STYLE_PATTERN, ' ');
  return withoutStyles.slice(0, MAX_SNIPPET_LENGTH);
}

function normalizeForComparison(value) {
  return normalizeText(value).toLowerCase();
}

function computeAgreement(chatgpt, deepseek) {
  if (!chatgpt || !deepseek) {
    return 0;
  }
  const titleMatch = normalizeForComparison(chatgpt.title) === normalizeForComparison(deepseek.title);
  const descMatch = normalizeForComparison(chatgpt.marketingDescription) === normalizeForComparison(deepseek.marketingDescription);
  const skuMatch = normalizeForComparison(chatgpt.sku) === normalizeForComparison(deepseek.sku);
  const votes = [titleMatch, descMatch, skuMatch];
  const score = votes.reduce((sum, match) => sum + (match ? 1 : 0), 0);
  return score / votes.length;
}

export async function applyIntelligentExtraction(html, context = {}) {
  const snippet = sanitizeSnippet(html);
  if (!snippet) {
    return { enabled: false, manualCheck: false };
  }

  const { sku, title: candidateTitle, description: candidateDescription, url, signal } = context;

  const result = await runLlmFilters({
    snippet,
    sku,
    candidateTitle: candidateTitle ? normalizeText(candidateTitle) : undefined,
    candidateDescription: candidateDescription ? normalizeText(candidateDescription) : undefined,
    url,
    signal
  });

  if (!result.enabled) {
    return { enabled: false, manualCheck: false };
  }

  const chatgpt = result.providers.chatgpt?.ok ? result.providers.chatgpt.data : null;
  const deepseek = result.providers.deepseek?.ok ? result.providers.deepseek.data : null;

  if (!chatgpt && !deepseek) {
    log.warn('LLM filters unavailable', { sku, url, promptHash: result.promptHash });
    return { enabled: true, manualCheck: false, marketingDescription: '' };
  }

  const responses = [chatgpt, deepseek].filter(Boolean);
  const hasBoth = Boolean(chatgpt && deepseek);
  const agreement = hasBoth ? computeAgreement(chatgpt, deepseek) : (responses[0]?.confidence ?? 0);
  const descriptions = responses.map((entry) => normalizeText(entry.marketingDescription)).filter(Boolean);
  const titles = responses.map((entry) => normalizeText(entry.title)).filter(Boolean);
  const skus = responses
    .map((entry) => normalizeText(entry.sku))
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const confidenceValues = responses.map((entry) => entry.confidence ?? 0).filter((value) => Number.isFinite(value));

  const normalizedSku = normalizeText(sku ?? '');
  if (normalizedSku) {
    const normalizedTarget = normalizedSku.toLowerCase();
    if (skus.length > 0 && skus.some((value) => value && value !== normalizedTarget)) {
      log.warn('LLM filters disagree on SKU', { sku, promptHash: result.promptHash });
      return {
        enabled: true,
        manualCheck: true,
        reason: 'sku-mismatch',
        promptHash: result.promptHash,
        providers: result.providers
      };
    }
  }

  const finalDescription = descriptions.length > 0 ? descriptions[0] : '';
  const finalTitle = titles.length > 0 ? titles[0] : null;
  const finalConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : agreement;

  const evidenceSource = responses.find((entry) => entry.evidenceSnippet && Number.isFinite(entry.charStart) && Number.isFinite(entry.charEnd))
    || responses.find((entry) => entry.evidenceSnippet);
  const evidence = evidenceSource?.evidenceSnippet ?? '';
  const charStart = Number.isFinite(evidenceSource?.charStart) ? Number(evidenceSource.charStart) : null;
  const charEnd = Number.isFinite(evidenceSource?.charEnd) ? Number(evidenceSource.charEnd) : null;

  const manualCheck = hasBoth && descriptions.length > 0 ? agreement < 0.67 : false;
  const allEmpty = descriptions.length === 0;

  const payload = {
    enabled: true,
    manualCheck: manualCheck && !allEmpty,
    marketingDescription: allEmpty ? '' : finalDescription,
    verifiedTitle: finalTitle,
    confidence: Number.isFinite(finalConfidence) ? Number(finalConfidence.toFixed(3)) : agreement,
    evidenceSnippet: sanitizeEvidenceSnippet(evidence),
    charStart,
    charEnd,
    promptHash: result.promptHash,
    providers: {
      chatgpt: result.providers.chatgpt?.ok ? { id: result.providers.chatgpt.id, model: result.providers.chatgpt.model } : null,
      deepseek: result.providers.deepseek?.ok ? { id: result.providers.deepseek.id, model: result.providers.deepseek.model } : null
    },
    agreement
  };

  log.info('LLM filter summary', {
    sku,
    url,
    promptHash: result.promptHash,
    agreement,
    confidence: payload.confidence,
    manualCheck: payload.manualCheck,
    description: payload.marketingDescription ? 'present' : 'empty'
  });

  return payload;
}

export default applyIntelligentExtraction;
