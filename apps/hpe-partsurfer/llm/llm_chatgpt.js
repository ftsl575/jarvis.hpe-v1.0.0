import process from 'node:process';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';

function isEnabled() {
  return typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim().length > 0;
}

function extractJson(content) {
  if (typeof content !== 'string') {
    throw new Error('ChatGPT response did not contain textual content');
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('ChatGPT response was empty');
  }

  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error('ChatGPT response was not valid JSON');
  }
}

export async function callChatGpt(messages, { signal } = {}) {
  if (!isEnabled()) {
    return { provider: 'chatgpt', ok: false, skipped: true, reason: 'missing_api_key' };
  }

  const apiKey = process.env.OPENAI_API_KEY.trim();
  const url = `${DEFAULT_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: DEFAULT_MODEL,
    messages,
    temperature: 0,
    response_format: { type: 'json_object' }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const error = new Error(`ChatGPT request failed with status ${response.status}`);
    error.status = response.status;
    error.provider = 'chatgpt';
    return { provider: 'chatgpt', ok: false, status: response.status, error };
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? null;
  const parsed = extractJson(content);
  return {
    provider: 'chatgpt',
    ok: true,
    status: response.status,
    raw: content,
    data: parsed,
    id: payload?.id ?? null,
    model: payload?.model ?? DEFAULT_MODEL
  };
}

export function chatGptEnabled() {
  return isEnabled();
}

export default callChatGpt;
