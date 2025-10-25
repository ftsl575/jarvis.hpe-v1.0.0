import crypto from 'node:crypto';
import { chatGptEnabled, callChatGpt } from './llm_chatgpt.js';
import { deepSeekEnabled, callDeepSeek } from './llm_deepseek.js';
import { normalizeText } from '../utils/normalizeText.js';

const BASE_SYSTEM_MESSAGE = `You are validating structured data extracted from a Hewlett Packard Enterprise (HPE) product page.\n` +
  `Only confirm facts that explicitly appear in the provided HTML snippet. Do not invent or infer details.\n` +
  `If a field cannot be verified from the snippet, return it as an empty string.`;

function buildMessages({ snippet, sku, candidateTitle, candidateDescription, url }) {
  const system = { role: 'system', content: BASE_SYSTEM_MESSAGE };
  const instructions = [
    `Target SKU: ${sku || 'UNKNOWN'}`,
    candidateTitle ? `Candidate Title: ${candidateTitle}` : null,
    candidateDescription ? `Candidate Marketing Description: ${candidateDescription}` : null,
    url ? `Page URL: ${url}` : null,
    '',
    'HTML SNIPPET START',
    snippet,
    'HTML SNIPPET END',
    '',
    'Respond with a JSON object containing the keys: "title", "marketing_description", "sku", "lang", "evidenceSnippet", "charStart", "charEnd", "confidence". ',
    'Values must come directly from the snippet. "confidence" must be a number between 0 and 1. '
      + 'Return empty strings when information is missing. '
      + 'If the snippet is insufficient, set all textual fields to empty strings and confidence to 0.'
  ]
    .filter(Boolean)
    .join('\n');

  const user = { role: 'user', content: instructions };
  return [system, user];
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Model payload must be an object');
  }

  const title = normalizeText(payload.title ?? '');
  const marketing = normalizeText(payload.marketing_description ?? '');
  const sku = normalizeText(payload.sku ?? '');
  const lang = normalizeText(payload.lang ?? '');
  const evidenceSnippet = normalizeText(payload.evidenceSnippet ?? '', { maxLength: 512 });
  const charStart = Number.isFinite(payload.charStart) ? Number(payload.charStart) : null;
  const charEnd = Number.isFinite(payload.charEnd) ? Number(payload.charEnd) : null;
  const confidence = Number.parseFloat(payload.confidence ?? 0);

  if (Number.isNaN(confidence) || confidence < 0) {
    return {
      title,
      marketingDescription: marketing,
      sku,
      lang,
      evidenceSnippet,
      charStart,
      charEnd,
      confidence: 0
    };
  }

  return {
    title,
    marketingDescription: marketing,
    sku,
    lang,
    evidenceSnippet,
    charStart,
    charEnd,
    confidence: confidence > 1 ? 1 : confidence
  };
}

export async function runLlmFilters({ snippet, sku, candidateTitle, candidateDescription, url, signal } = {}) {
  const trimmed = typeof snippet === 'string' ? snippet.trim() : '';
  if (!trimmed) {
    return {
      enabled: false,
      providers: {},
      promptHash: null
    };
  }

  const hash = crypto.createHash('sha256').update(trimmed).digest('hex');
  const messages = buildMessages({ snippet: trimmed, sku, candidateTitle, candidateDescription, url });
  const providers = {};

  const tasks = [];
  if (chatGptEnabled()) {
    tasks.push(
      callChatGpt(messages, { signal })
        .then((result) => ({ key: 'chatgpt', result }))
        .catch((error) => ({ key: 'chatgpt', result: { provider: 'chatgpt', ok: false, error } }))
    );
  }
  if (deepSeekEnabled()) {
    tasks.push(
      callDeepSeek(messages, { signal })
        .then((result) => ({ key: 'deepseek', result }))
        .catch((error) => ({ key: 'deepseek', result: { provider: 'deepseek', ok: false, error } }))
    );
  }

  if (tasks.length === 0) {
    return { enabled: false, providers: {}, promptHash: hash };
  }

  const settled = await Promise.all(tasks);
  for (const { key, result } of settled) {
    if (result.ok) {
      try {
        providers[key] = {
          ok: true,
          data: normalizePayload(result.data),
          raw: result.raw ?? null,
          status: result.status ?? null,
          model: result.model ?? null,
          id: result.id ?? null
        };
      } catch (error) {
        providers[key] = { ok: false, error };
      }
    } else {
      providers[key] = { ok: false, ...result };
    }
  }

  return {
    enabled: true,
    providers,
    promptHash: hash
  };
}

export default runLlmFilters;
