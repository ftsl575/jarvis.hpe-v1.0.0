import pLimit from 'p-limit';
import config from './config.js';
import { log } from './logger.js';
import { detectMode, FALLBACK_ELIGIBLE_PATTERN, SEARCH_ONLY_PATTERN } from './mode.js';
import { normalizePartNumber } from './normalize.js';
import { getSearchHtml, getPhotoHtml } from './fetch.js';
import { parseSearch } from './parseSearch.js';
import { parsePhoto } from './parsePhoto.js';

async function fetchPhotoInfo(partNumber, options) {
  const photoHtml = await getPhotoHtml(partNumber, options);
  return parsePhoto(photoHtml);
}

function resolvedLiveOption(options) {
  if (options && typeof options.live === 'boolean') {
    return options.live;
  }

  return config.LIVE_MODE;
}

export async function runForPart(partNumber, options = {}) {
  const live = resolvedLiveOption(options);
  const normalized = normalizePartNumber(partNumber);
  const mode = detectMode(normalized);

  log.info('Processing part', { partNumber: normalized, mode, live });

  let description = null;
  let imageUrl = null;
  let sourcePage = mode;
  let status = 'not_found';

  const fetchOptions = { live };

  if (mode === 'Search') {
    const searchHtml = await getSearchHtml(normalized, fetchOptions);
    const searchResult = parseSearch(searchHtml);
    const hasDescription = Boolean(searchResult.description);

    if (hasDescription) {
      description = searchResult.description;
      imageUrl = searchResult.imageUrl ?? null;
      status = searchResult.bomPresent ? 'ok' : 'no_bom';
      sourcePage = 'Search';
    }

    const fallbackAllowed = FALLBACK_ELIGIBLE_PATTERN.test(normalized) && !SEARCH_ONLY_PATTERN.test(normalized);
    const needsFallback = fallbackAllowed && (!hasDescription || searchResult.bomPresent === false);

    if (needsFallback) {
      log.debug('Falling back to photo lookup', { partNumber: normalized });
      const photoResult = await fetchPhotoInfo(normalized, fetchOptions);
      if (!hasDescription && photoResult.description) {
        description = photoResult.description;
        sourcePage = 'Photo';
        status = 'ok';
      }

      if (photoResult.imageUrl) {
        imageUrl = photoResult.imageUrl;
      }

      if (!hasDescription && !photoResult.description) {
        status = 'not_found';
      }
    } else if (!hasDescription) {
      status = 'not_found';
    }
  } else {
    const photoResult = await fetchPhotoInfo(normalized, fetchOptions);

    if (photoResult.description) {
      description = photoResult.description;
      imageUrl = photoResult.imageUrl ?? null;
      status = 'ok';
      sourcePage = 'Photo';
    } else {
      status = 'not_found';
      imageUrl = null;
      sourcePage = 'Photo';
    }
  }

  const result = {
    part_number: normalized,
    description,
    image_url: imageUrl ?? null,
    source_page: sourcePage,
    status
  };

  log.info('Completed part', { partNumber: normalized, status: result.status, source: result.source_page });

  return result;
}

function resolveThrottleSettings(options = {}) {
  if (typeof options.throttleMs === 'number') {
    return {
      intervalMs: Math.max(0, options.throttleMs),
      concurrency: 1
    };
  }

  const throttleRps = typeof options.throttleRps === 'number' ? options.throttleRps : config.THROTTLE_RPS;
  if (!Number.isFinite(throttleRps) || throttleRps <= 0) {
    return {
      intervalMs: 0,
      concurrency: Infinity
    };
  }

  const concurrency = Math.max(1, Math.floor(throttleRps));
  const intervalMs = Math.floor(1000 / throttleRps);

  return {
    intervalMs,
    concurrency
  };
}

export async function runBatch(parts, options = {}) {
  if (!Array.isArray(parts)) {
    throw new TypeError('parts must be an array');
  }

  const live = resolvedLiveOption(options);
  const { intervalMs, concurrency } = resolveThrottleSettings(options);
  log.info('Starting batch', { count: parts.length, live, intervalMs, concurrency });

  const limit = pLimit(concurrency === Infinity ? parts.length || 1 : concurrency);
  let throttleChain = Promise.resolve();
  let lastStart = 0;

  async function applyThrottle() {
    if (intervalMs <= 0) {
      return;
    }

    const previous = throttleChain;
    let resolver;
    throttleChain = new Promise((resolve) => {
      resolver = resolve;
    });

    await previous;
    const now = Date.now();
    const earliest = lastStart + intervalMs;
    const wait = Math.max(0, earliest - now);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastStart = Date.now();
    resolver();
  }

  const tasks = parts.map((part) => limit(async () => {
    await applyThrottle();
    return runForPart(part, { live });
  }));

  const results = [];
  for (const task of tasks) {
    results.push(await task);
  }

  log.info('Finished batch', { count: results.length, live });
  return results;
}
