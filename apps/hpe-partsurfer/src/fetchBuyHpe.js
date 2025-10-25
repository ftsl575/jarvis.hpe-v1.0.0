import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import config from './config.js';
import { log } from './logger.js';

const DEFAULT_BASE_URL = 'https://buy.hpe.com/';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_USER_AGENT = config.USER_AGENT ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Safari/537.36';
const MIN_PACING_DELAY_MS = 2_000;
const MAX_PACING_DELAY_MS = 4_000;
const USER_AGENT_POOL = [
  DEFAULT_USER_AGENT,
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.134 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/104.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.92 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.92 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_7_10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.96 Safari/537.36',
  'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15'
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

function randomInt(min, max) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function computeDelay(attempt) {
  const base = 500 * 2 ** attempt;
  const jitter = randomInt(100, 500);
  return base + jitter;
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

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function computeUaId(userAgent) {
  return crypto.createHash('sha1').update(userAgent).digest('hex').slice(0, 8);
}

function getSetCookie(headers) {
  if (!headers) {
    return [];
  }
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  if (typeof headers.raw === 'function') {
    return headers.raw()['set-cookie'] ?? [];
  }
  const header = headers.get('set-cookie');
  if (!header) {
    return [];
  }
  return [header];
}

function createCookieJar() {
  const jar = new Map();
  return {
    store(cookies) {
      for (const cookie of cookies) {
        const [pair] = cookie.split(';');
        if (!pair) {
          continue;
        }
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex === -1) {
          continue;
        }
        const name = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (!name) {
          continue;
        }
        jar.set(name, value);
      }
    },
    header() {
      if (jar.size === 0) {
        return null;
      }
      return Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
    reset() {
      jar.clear();
    }
  };
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
  let rotation = shuffle(userAgents);
  let rotationIndex = 0;
  const cookieJar = createCookieJar();

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const signals = [];
    let timeoutId;
    let currentUaId = null;

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
      const pacingDelayMs = randomInt(MIN_PACING_DELAY_MS, MAX_PACING_DELAY_MS);
      if (pacingDelayMs > 0) {
        await delay(pacingDelayMs);
      }
      if (rotationIndex >= rotation.length) {
        rotation = shuffle(userAgents);
        rotationIndex = 0;
      }
      const userAgent = rotation[rotationIndex % rotation.length];
      currentUaId = computeUaId(userAgent);
      rotationIndex += 1;
      const cookieHeader = cookieJar.header();
      log.info('Fetching buy.hpe.com resource', { url, attempt: attempt + 1, userAgent, uaId: currentUaId, pacingDelayMs });
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...(cookieHeader ? { cookie: cookieHeader } : {})
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
      const cookies = getSetCookie(response.headers);
      if (cookies.length > 0) {
        cookieJar.store(cookies);
      }
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
        attempt: attempt + 1,
        uaId: currentUaId,
        parseHint: 'buy',
        method: 'http',
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
        attempt: attempt + 1,
        uaId: currentUaId,
        parseHint: 'buy',
        method: 'http',
        success: false
      });

      if (!shouldRetry || attempt === retries) {
        throw error;
      }

      if (status === 403 || status === 429) {
        cookieJar.reset();
        rotation = shuffle(userAgents);
        rotationIndex = 0;
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
