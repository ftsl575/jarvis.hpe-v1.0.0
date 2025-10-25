import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getSearchHtml, getPhotoHtml } from './fetch.js';
import { parseSearch } from './parseSearch.js';
import { parsePhoto } from './parsePhoto.js';
import { normalizePartNumber } from './normalize.js';
import config from './config.js';
import { log } from './logger.js';
import { exportCsvMultiSource } from './exportCsvMultiSource.js';

export const NO_DATA_AT_THIS_SOURCE = 'NO DATA AT THIS SOURCE';

const BUY_MODULE_SPECIFIERS = {
  fetch: './fetchBuyHpe.js',
  parse: './parseBuyHpe.js'
};

let buyModulePromise;

async function loadBuyModules() {
  if (!buyModulePromise) {
    buyModulePromise = (async () => {
      try {
        const [{ default: fetchDefault, fetchBuyHpe }, { default: parseDefault, parseBuyHpe }]
          = await Promise.all([
            import(BUY_MODULE_SPECIFIERS.fetch),
            import(BUY_MODULE_SPECIFIERS.parse)
          ]);

        const fetchFn = typeof fetchBuyHpe === 'function' ? fetchBuyHpe : fetchDefault;
        const parseFn = typeof parseBuyHpe === 'function' ? parseBuyHpe : parseDefault;

        return {
          fetchBuyHpe: typeof fetchFn === 'function' ? fetchFn : null,
          parseBuyHpe: typeof parseFn === 'function' ? parseFn : null
        };
      } catch (error) {
        log.debug('Buy.HPE modules unavailable', { message: error?.message });
        return { fetchBuyHpe: null, parseBuyHpe: null };
      }
    })();
  }

  return buyModulePromise;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return NO_DATA_AT_THIS_SOURCE;
  }
}

function normalizeOutputValue(value) {
  if (value === null || value === undefined) {
    return NO_DATA_AT_THIS_SOURCE;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : NO_DATA_AT_THIS_SOURCE;
  }

  return safeJsonStringify(value);
}

function hasPartSurferData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  const {
    description,
    category,
    imageUrl,
    availability,
    bomItems,
    compatibleProducts,
    replacedBy,
    substitute
  } = parsed;

  if (description || category || imageUrl || availability || replacedBy || substitute) {
    return true;
  }

  if (Array.isArray(bomItems) && bomItems.length > 0) {
    return true;
  }

  if (Array.isArray(compatibleProducts) && compatibleProducts.length > 0) {
    return true;
  }

  return false;
}

function hasPhotoData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  return Boolean(parsed.title || parsed.imageUrl);
}

function hasBuyData(parsed) {
  if (parsed === null || parsed === undefined) {
    return false;
  }

  if (typeof parsed === 'string') {
    return parsed.trim().length > 0;
  }

  if (Array.isArray(parsed)) {
    return parsed.length > 0;
  }

  if (typeof parsed !== 'object') {
    return false;
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return false;
  }

  for (const [key, value] of entries) {
    if (key === 'notFound' || key === 'multipleResults') {
      if (value) {
        return false;
      }
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        continue;
      }
    }

    return true;
  }

  return false;
}

async function fetchPartSurfer(partNumber, options) {
  try {
    const html = await getSearchHtml(partNumber, options);
    const parsed = parseSearch(html);
    return hasPartSurferData(parsed) ? normalizeOutputValue(parsed) : NO_DATA_AT_THIS_SOURCE;
  } catch (error) {
    log.warn('Failed to aggregate PartSurfer search data', {
      partNumber,
      message: error?.message
    });
    return NO_DATA_AT_THIS_SOURCE;
  }
}

async function fetchPartSurferPhoto(partNumber, options) {
  try {
    const html = await getPhotoHtml(partNumber, options);
    const parsed = parsePhoto(html);
    return hasPhotoData(parsed) ? normalizeOutputValue(parsed) : NO_DATA_AT_THIS_SOURCE;
  } catch (error) {
    log.warn('Failed to aggregate PartSurfer photo data', {
      partNumber,
      message: error?.message
    });
    return NO_DATA_AT_THIS_SOURCE;
  }
}

async function fetchBuyHpe(partNumber, options) {
  const { fetchBuyHpe: fetchFn, parseBuyHpe: parseFn } = await loadBuyModules();
  if (typeof fetchFn !== 'function' || typeof parseFn !== 'function') {
    return NO_DATA_AT_THIS_SOURCE;
  }

  try {
    const raw = await fetchFn(partNumber, options);
    const parsed = await parseFn(raw, partNumber, options);
    return hasBuyData(parsed) ? normalizeOutputValue(parsed) : NO_DATA_AT_THIS_SOURCE;
  } catch (error) {
    log.warn('Failed to aggregate Buy.HPE data', {
      partNumber,
      message: error?.message
    });
    return NO_DATA_AT_THIS_SOURCE;
  }
}

export async function aggregateMultiSource(partNumbers, options = {}) {
  if (!Array.isArray(partNumbers)) {
    throw new TypeError('partNumbers must be an array');
  }

  const results = [];
  for (const part of partNumbers) {
    let normalized;
    try {
      normalized = normalizePartNumber(part);
    } catch (error) {
      log.warn('Skipping invalid part number', { value: part });
      continue;
    }

    const fetchOptions = { ...options };
    const [partsurfer, partsurferPhoto, buyHpe] = await Promise.all([
      fetchPartSurfer(normalized, fetchOptions),
      fetchPartSurferPhoto(normalized, fetchOptions),
      fetchBuyHpe(normalized, fetchOptions)
    ]);

    results.push({
      partNumber: normalized,
      partsurfer,
      partsurferPhoto,
      buyHpe
    });
  }

  return results;
}

function uniqueNormalized(parts) {
  const seen = new Set();
  const unique = [];

  for (const part of parts) {
    try {
      const normalized = normalizePartNumber(part);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(normalized);
      }
    } catch (error) {
      // Ignore invalid part numbers.
    }
  }

  return unique;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input' || token === '-i') {
      args.input = argv[index + 1];
      index += 1;
    } else if (token === '--out' || token === '-o') {
      args.out = argv[index + 1];
      index += 1;
    } else if (token === '--live') {
      args.live = true;
    }
  }

  return args;
}

function deriveOutputPaths(outArgument) {
  const resolved = path.resolve(process.cwd(), outArgument ?? 'sample_results.csv');
  const extension = path.extname(resolved);

  if (extension) {
    const base = resolved.slice(0, resolved.length - extension.length);
    return {
      commaPath: resolved,
      semicolonPath: `${base}_semicolon${extension}`
    };
  }

  const base = resolved;
  const fallbackExtension = '.csv';
  return {
    commaPath: `${base}${fallbackExtension}`,
    semicolonPath: `${base}_semicolon${fallbackExtension}`
  };
}

async function readPartNumbersFromFile(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  return contents
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  const { input, out, live: liveFlag } = parseArgs(process.argv.slice(2));
  if (!input) {
    throw new Error('Usage: node src/aggregateMultiSource.js --input <file> [--out <file>] [--live]');
  }

  const live = liveFlag ?? config.LIVE_MODE;
  if (!live) {
    log.warn('Live mode disabled; aggregation will use cached data if available.');
  }

  const inputPath = path.resolve(process.cwd(), input);
  const parts = await readPartNumbersFromFile(inputPath);
  const normalizedParts = uniqueNormalized(parts);

  log.info('Running multi-source aggregation', {
    count: normalizedParts.length,
    live
  });

  const rows = await aggregateMultiSource(normalizedParts, { live });
  const { commaPath, semicolonPath } = deriveOutputPaths(out);
  await exportCsvMultiSource(rows, { commaPath, semicolonPath });

  log.info('Multi-source aggregation complete', {
    commaPath,
    semicolonPath,
    rows: rows.length
  });
}

const isMain = (() => {
  const current = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
