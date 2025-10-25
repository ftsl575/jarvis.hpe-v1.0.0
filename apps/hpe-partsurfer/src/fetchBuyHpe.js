import { setTimeout as delay } from 'node:timers/promises';
import config from './config.js';
import { log } from './logger.js';

const DEFAULT_BASE_URL = 'https://buy.hpe.com/';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_USER_AGENT = config.USER_AGENT ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Safari/537.36';
const USER_AGENT_POOL = [
  DEFAULT_USER_AGENT,
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
];

function logNetworkEvent(options, payload) {
  const logger = options?.logger;
  if (!logger || typeof logger.log !== 'function') {
    return;
  }

  try {
    logger.log({ ts: new Date().toISOString(), ...payload });
  } catch (error) {
    // Swallow logging failures to avoid affecting fetch flow.
  }
}

function resolveLive(options) {
  if (options && typeof options.live === 'boolean') {
    return options.live;
  }
  return config.LIVE_MODE;
}

function ensureFetchImpl(fetchImpl) {
  const candidate = fetchImpl ?? globalThis.fetch;
  if (typeof candidate !== 'function') {
    throw new Error('Global fetch is not available; provide options.fetch implementation');
  }
  return candidate;
}

function resolveBaseUrl(input) {
  if (!input) {
    return DEFAULT_BASE_URL;
  }
  try {
    const normalized = new URL(input, DEFAULT_BASE_URL).toString();
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  } catch (error) {
    throw new Error(`Invalid baseUrl provided: ${input}`);
  }
}

function resolveUrl(target, baseUrl) {
  if (typeof target !== 'string') {
    throw new TypeError('Target URL must be a string');
  }
  const trimmed = target.trim();
  if (!trimmed) {
    throw new TypeError('Target URL must not be empty');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const leadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return new URL(leadingSlash, baseUrl).toString();
}

function shouldRetryStatus(status) {
  if (!Number.isFinite(status)) {
    return false;
  }
  return status === 429 || status >= 500;
}

function computeDelay(attempt) {
  const base = 500;
  return base * 2 ** attempt;
}

function resolveUserAgents(options) {
  const pool = [];

  if (Array.isArray(options.userAgents)) {
    for (const entry of options.userAgents) {
      if (typeof entry === 'string' && entry.trim()) {
        pool.push(entry.trim());
      }
    }
  }

  if (typeof options.userAgent === 'string' && options.userAgent.trim()) {
    pool.unshift(options.userAgent.trim());
  }

  for (const candidate of USER_AGENT_POOL) {
    if (typeof candidate === 'string' && candidate.trim()) {
      pool.push(candidate.trim());
    }
  }

  const unique = [];
  for (const entry of pool) {
    if (!unique.includes(entry)) {
      unique.push(entry);
    }
  }

  if (unique.length === 0) {
    unique.push(DEFAULT_USER_AGENT);
  }

  return unique;
}

function cleanupAbort(signal, handler) {
  if (signal && handler) {
    signal.removeEventListener('abort', handler);
  }
}

export async function fetchBuyHpe(target, options = {}) {
  const live = resolveLive(options);
  if (!live) {
    const error = new Error('Live mode is disabled; enable --live flag or set LIVE_MODE=true');
    error.code = 'LIVE_DISABLED';
    throw error;
  }

  const fetchImpl = ensureFetchImpl(options.fetch);
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const url = resolveUrl(target, baseUrl);
  const retries = Number.isFinite(options.retries) ? Math.max(0, options.retries) : DEFAULT_RETRIES;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const userAgents = resolveUserAgents(options);

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const signals = [];
    let timeoutId;

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        const abortHandler = () => controller.abort(options.signal.reason);
        options.signal.addEventListener('abort', abortHandler, { once: true });
        signals.push({ signal: options.signal, handler: abortHandler });
      }
    }

    timeoutId = setTimeout(() => {
      controller.abort(new Error('Request timed out'));
    }, timeoutMs);

    try {
      const started = Date.now();
      const userAgent = userAgents[attempt % userAgents.length];
      log.info('Fetching buy.hpe.com resource', { url, attempt: attempt + 1, userAgent });
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9'
        },
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      signals.forEach(({ signal, handler }) => cleanupAbort(signal, handler));

      const { status } = response;
      const finalUrl = response.url ?? url;

      if (!response.ok) {
        const error = new Error(`Request failed with status ${status}`);
        error.status = status;
        error.url = finalUrl;
        throw error;
      }

      const html = await response.text();
      const size = Buffer.byteLength(html, 'utf8');
      const durationMs = Date.now() - started;
      log.info('Fetched buy.hpe.com resource', { url: finalUrl, status, bytes: size, durationMs });
      logNetworkEvent(options, {
        sku: options.partNumber ?? null,
        provider: options.provider ?? 'BUY',
        url: finalUrl,
        http: status,
        bytes: size,
        durationMs,
        retries: attempt,
        parseHint: 'buy',
        success: true
      });
      return { url: finalUrl, status, html };
    } catch (error) {
      clearTimeout(timeoutId);
      signals.forEach(({ signal, handler }) => cleanupAbort(signal, handler));
      lastError = error;
      const status = error?.status;
      const shouldRetry = shouldRetryStatus(status) || (!status && attempt < retries);
      const level = attempt === retries || !shouldRetry ? 'error' : 'warn';
      log[level]('Failed to fetch buy.hpe.com resource', { url, attempt: attempt + 1, message: error?.message, status });

      logNetworkEvent(options, {
        sku: options.partNumber ?? null,
        provider: options.provider ?? 'BUY',
        url,
        http: status ?? null,
        bytes: 0,
        durationMs: null,
        retries: attempt,
        parseHint: 'buy',
        success: false
      });

      if (!shouldRetry || attempt === retries) {
        throw error;
      }

      const waitMs = computeDelay(attempt);
      await delay(waitMs);
    } finally {
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Unable to fetch buy.hpe.com resource');
}

export default fetchBuyHpe;
