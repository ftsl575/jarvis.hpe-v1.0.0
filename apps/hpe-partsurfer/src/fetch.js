import axios from 'axios';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import config from './config.js';
import { log } from './logger.js';

const PARTSURFER_BASE_URL = 'https://partsurfer.hpe.com/';

const debugRoot = path.resolve(process.cwd(), config.DEBUG_DIR);
let ensureDebugDirPromise;

function safePartNumber(partNumber) {
  if (typeof partNumber !== 'string' || partNumber.length === 0) {
    return 'UNKNOWN';
  }

  return partNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'UNKNOWN';
}

function resolveDebugPath(filename) {
  return path.join(debugRoot, filename);
}

function ensureDebugDir() {
  if (!ensureDebugDirPromise) {
    ensureDebugDirPromise = mkdir(debugRoot, { recursive: true }).catch((error) => {
      log.warn('Unable to create debug directory', {
        directory: debugRoot,
        message: error?.message
      });
    });
  }

  return ensureDebugDirPromise;
}

function logNetworkEvent(options, payload) {
  const logger = options?.logger;
  if (!logger || typeof logger.log !== 'function') {
    return;
  }

  try {
    logger.log({ ts: new Date().toISOString(), ...payload });
  } catch (error) {
    // Ignore logging errors to avoid interfering with fetch operations.
  }
}

async function saveDebugHtml(kind, partNumber, html) {
  if (!config.DEBUG_SAVE_HTML || !html) {
    return;
  }

  const safePn = safePartNumber(partNumber);
  const filename = `${kind}_${safePn}.html`;
  const targetPath = resolveDebugPath(filename);

  try {
    await ensureDebugDir();
    await writeFile(targetPath, html, 'utf8');
    log.info('Saved debug HTML snapshot', {
      page: kind,
      partNumber: safePn,
      file: targetPath
    });
  } catch (error) {
    log.warn('Failed to write debug HTML snapshot', {
      page: kind,
      partNumber: safePn,
      file: targetPath,
      message: error?.message
    });
  }
}

const client = axios.create({
  baseURL: PARTSURFER_BASE_URL,
  timeout: config.TIMEOUT_MS,
  headers: {
    'User-Agent': config.USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.8'
  },
  responseType: 'text',
  proxy: false
});

const proxyAgent = config.HPE_PROXY_URL ? new HttpsProxyAgent(config.HPE_PROXY_URL) : undefined;

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  if (error.response) {
    return error.response.status >= 500;
  }

  return true;
}

function resolvedLiveMode(options) {
  if (options && typeof options.live === 'boolean') {
    return options.live;
  }

  return config.LIVE_MODE;
}

function createLiveDisabledError() {
  const error = new Error('Live mode is disabled; enable --live flag or set LIVE_MODE=true');
  error.code = 'LIVE_DISABLED';
  return error;
}

function retryDelay(attempt) {
  if (attempt <= 0) {
    return 300;
  }

  return 300 * (3 ** attempt);
}

function resolveRetryCount(options) {
  if (options && Number.isFinite(options.retries)) {
    return Math.max(0, options.retries);
  }

  return Math.max(0, config.RETRIES);
}

function resolveTimeout(options) {
  if (options && Number.isFinite(options.timeoutMs)) {
    return Math.max(1, options.timeoutMs);
  }

  return config.TIMEOUT_MS;
}

function ensureFetchImpl(options) {
  const candidate = options?.fetch ?? globalThis.fetch;
  if (typeof candidate !== 'function') {
    throw new Error('Global fetch is not available; provide options.fetch implementation');
  }
  return candidate;
}

function buildFetchHeaders() {
  return {
    'user-agent': config.USER_AGENT,
    'accept-language': 'en-US,en;q=0.8',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

async function performFetch(relativeUrl, options, debugInfo) {
  const live = resolvedLiveMode(options);

  if (!live) {
    throw createLiveDisabledError();
  }

  const fetchImpl = ensureFetchImpl(options);
  const retries = resolveRetryCount(options);
  const timeoutMs = resolveTimeout(options);
  const targetUrl = new URL(relativeUrl, PARTSURFER_BASE_URL).toString();
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('Request timed out'));
    }, timeoutMs);

    try {
      const started = Date.now();
      log.info('Requesting resource', { url: targetUrl, attempt: attempt + 1 });
      const response = await fetchImpl(targetUrl, {
        method: 'GET',
        headers: buildFetchHeaders(),
        redirect: 'follow',
        signal: controller.signal
      });

      const finalUrl = response.url || targetUrl;
      const status = response.status;
      if (!response.ok) {
        const error = new Error(`Request failed with status ${status}`);
        error.status = status;
        error.url = finalUrl;
        throw error;
      }

      const html = await response.text();
      const durationMs = Date.now() - started;
      const size = Buffer.byteLength(html ?? '', 'utf8');
      log.info('Request succeeded', { url: finalUrl, status, bytes: size, durationMs });

      logNetworkEvent(options, {
        sku: debugInfo?.partNumber ?? null,
        provider: debugInfo?.provider ?? debugInfo?.kind ?? 'photo',
        url: finalUrl,
        http: status,
        bytes: size,
        durationMs,
        retries: attempt,
        parseHint: debugInfo?.kind ?? null,
        success: true
      });

      if (config.DEBUG_SAVE_HTML) {
        const partNumber = debugInfo?.partNumber;
        const kind = debugInfo?.kind ?? 'page';
        await saveDebugHtml(kind, partNumber, html);
      }

      clearTimeout(timeoutId);
      return html;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const status = error?.status;
      const message = status ? `status ${status}` : error?.message;
      const level = attempt === retries ? 'error' : 'warn';
      log[level]('Request failed', { url: targetUrl, attempt: attempt + 1, message, status });

      logNetworkEvent(options, {
        sku: debugInfo?.partNumber ?? null,
        provider: debugInfo?.provider ?? debugInfo?.kind ?? 'photo',
        url: targetUrl,
        http: status ?? null,
        bytes: 0,
        durationMs: null,
        retries: attempt,
        parseHint: debugInfo?.kind ?? null,
        success: false
      });

      if (!shouldRetry(error) || attempt === retries) {
        throw error;
      }

      const delayMs = retryDelay(attempt);
      log.debug('Retrying request after delay', { url: targetUrl, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    attempt += 1;
  }

  throw lastError;
}

async function performGet(url, options, debugInfo) {
  const live = resolvedLiveMode(options);

  if (!live) {
    throw createLiveDisabledError();
  }

  const maxRetries = resolveRetryCount(options);
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    try {
      const started = Date.now();
      log.info('Requesting resource', { url, attempt: attempt + 1 });
      const response = await client.get(url, {
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        timeout: resolveTimeout(options)
      });
      const size = Buffer.byteLength(response.data ?? '', 'utf8');
      const durationMs = Date.now() - started;
      const finalUrl = response.request?.res?.responseUrl
        || (response.config?.url ? new URL(response.config.url, PARTSURFER_BASE_URL).toString() : url);
      log.info('Request succeeded', { url: finalUrl, status: response.status, bytes: size, durationMs });

      logNetworkEvent(options, {
        sku: debugInfo?.partNumber ?? null,
        provider: debugInfo?.provider ?? debugInfo?.kind ?? 'search',
        url: finalUrl,
        http: response.status,
        bytes: size,
        durationMs,
        retries: attempt,
        parseHint: debugInfo?.kind ?? null,
        success: true
      });

      if (config.DEBUG_SAVE_HTML) {
        const partNumber = debugInfo?.partNumber;
        const kind = debugInfo?.kind ?? 'page';
        await saveDebugHtml(kind, partNumber, response.data);
      }

      return response.data;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const message = status ? `status ${status}` : error.message;
      const level = attempt === maxRetries ? 'error' : 'warn';
      log[level]('Request failed', { url, attempt: attempt + 1, message });

      logNetworkEvent(options, {
        sku: debugInfo?.partNumber ?? null,
        provider: debugInfo?.provider ?? debugInfo?.kind ?? 'search',
        url,
        http: status ?? null,
        bytes: 0,
        durationMs: null,
        retries: attempt,
        parseHint: debugInfo?.kind ?? null,
        success: false
      });

      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }

      const delayMs = retryDelay(attempt);
      log.debug('Retrying request after delay', { url, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    attempt += 1;
  }

  throw lastError;
}

export async function getSearchHtml(partNumber, options) {
  const params = new URLSearchParams({ SearchText: partNumber });
  return performGet(`Search.aspx?${params.toString()}`, options, {
    kind: 'search',
    provider: 'PS',
    partNumber
  });
}

export async function getPhotoHtml(partNumber, options) {
  const params = new URLSearchParams({ partnumber: partNumber });
  return performFetch(`ShowPhoto.aspx?${params.toString()}`, options, {
    kind: 'photo',
    provider: 'PSPhoto',
    partNumber
  });
}
