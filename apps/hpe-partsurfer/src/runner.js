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

  const result = {
    part_number: normalized,
    description: null,
    category: null,
    image_url: null,
    source_page: mode,
    status: 'not_found',
    replaced_by: null,
    substitute: null,
    bom_count: 0,
    compatible_count: 0
  };

  const fetchOptions = { live };
  if (options.fetch) {
    fetchOptions.fetch = options.fetch;
  }
  if (Number.isFinite(options.retries)) {
    fetchOptions.retries = options.retries;
  }
  if (options.logger) {
    fetchOptions.logger = options.logger;
  }
  let searchResult = null;
  let searchParseError = null;

  if (mode === 'Search') {
    const searchHtml = await getSearchHtml(normalized, fetchOptions);
    try {
      searchResult = parseSearch(searchHtml);
    } catch (error) {
      searchParseError = error;
      log.error('Failed to parse search HTML', {
        partNumber: normalized,
        message: error?.message
      });
    }

    if (searchResult) {
      result.source_page = 'Search';
      result.category = searchResult.category ?? null;
      if (searchResult.imageUrl) {
        result.image_url = searchResult.imageUrl;
      }
      if (searchResult.description) {
        result.description = searchResult.description;
      }
      result.replaced_by = searchResult.replacedBy ?? null;
      result.substitute = searchResult.substitute ?? null;
      result.bom_count = searchResult.bomItems.length;
      result.compatible_count = searchResult.compatibleProducts.length;
    }
  } else {
    const photoResult = await fetchPhotoInfo(normalized, fetchOptions);

    if (photoResult.title) {
      result.description = photoResult.title;
      result.image_url = photoResult.imageUrl ?? null;
      result.source_page = 'Photo';
    } else {
      result.status = 'not_found';
      result.image_url = null;
      result.source_page = 'Photo';

      if (live) {
        try {
          const searchHtml = await getSearchHtml(normalized, fetchOptions);
          const searchResult = parseSearch(searchHtml);
          if (searchResult.description) {
            result.description = searchResult.description;
          }
          if (searchResult.category) {
            result.category = searchResult.category;
          }
        } catch (error) {
          log.warn('Fallback search after missing photo failed', {
            partNumber: normalized,
            message: error?.message
          });
        }
      }
    }
  }

  const fallbackAllowed = FALLBACK_ELIGIBLE_PATTERN.test(normalized) && !SEARCH_ONLY_PATTERN.test(normalized);
  const allowPhotoFallback = !searchResult?.multipleResults && fallbackAllowed;

  if (mode === 'Search' && allowPhotoFallback && (!result.description || !result.image_url)) {
    log.debug('Falling back to photo lookup', { partNumber: normalized });
    const photoResult = await fetchPhotoInfo(normalized, fetchOptions);
    if (!result.description && photoResult.title) {
      result.description = photoResult.title;
      result.source_page = 'Photo';
    }
    if (!result.image_url && photoResult.imageUrl) {
      result.image_url = photoResult.imageUrl;
    }
  }

  if (searchParseError) {
    result.status = 'parse_error';
  } else if (searchResult?.multipleResults) {
    result.status = 'multi_match';
  } else if (result.description) {
    if (mode === 'Search' || searchResult) {
      result.status = result.bom_count > 0 ? 'ok' : 'no_bom';
    } else {
      result.status = 'ok';
    }
  } else if (searchResult?.notFound) {
    result.status = 'not_found';
  } else {
    result.status = 'not_found';
  }

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
    return runForPart(part, {
      live,
      fetch: options.fetch,
      retries: options.retries,
      logger: options.logger
    });
  }));

  const results = [];
  for (const task of tasks) {
    results.push(await task);
  }

  log.info('Finished batch', { count: results.length, live });
  return results;
}
