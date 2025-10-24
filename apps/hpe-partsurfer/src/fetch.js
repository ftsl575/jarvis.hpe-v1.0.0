import axios from 'axios';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import config from './config.js';
import { log } from './logger.js';

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
  baseURL: 'https://partsurfer.hpe.com/',
  timeout: config.TIMEOUT_MS,
  headers: {
    'User-Agent': config.USER_AGENT
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

async function performGet(url, options, debugInfo) {
  const live = resolvedLiveMode(options);

  if (!live) {
    throw createLiveDisabledError();
  }

  const maxRetries = Math.max(0, config.RETRIES);
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    try {
      log.info('Requesting resource', { url, attempt: attempt + 1 });
      const response = await client.get(url, {
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent
      });
      const size = Buffer.byteLength(response.data ?? '', 'utf8');
      log.info('Request succeeded', { url, status: response.status, bytes: size });

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
    partNumber
  });
}

export async function getPhotoHtml(partNumber, options) {
  const params = new URLSearchParams({ partnumber: partNumber });
  return performGet(`ShowPhoto.aspx?${params.toString()}`, options, {
    kind: 'photo',
    partNumber
  });
}
