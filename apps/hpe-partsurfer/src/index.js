import { detectMode } from './mode.js';
import { runForPart, runBatch } from './runner.js';
import { parseSearch } from './parseSearch.js';
import { parsePhoto } from './parsePhoto.js';
import { normalizePartNumber } from './normalize.js';
import fetchBuyHpe from './fetchBuyHpe.js';
import { parseBuyHpe } from './parseBuyHpe.js';
import { providerBuyHpe } from './providerBuyHpe.js';
import exportCsvBuyHpe from './exportCsvBuyHpe.js';
import { log } from './logger.js';

const VALID_PATTERN = /^[A-Za-z0-9]{3,6}(?:-[A-Za-z0-9]{2,6})?$/;

const aggregatorProviders = [];

function providerEntryName(entry) {
  return entry.name ?? entry.fn?.name ?? 'provider';
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function findProviderIndex(target) {
  if (!target) {
    return -1;
  }

  if (typeof target === 'function') {
    return aggregatorProviders.findIndex((entry) => entry.fn === target);
  }

  if (typeof target === 'string') {
    const lookup = target.trim().toLowerCase();
    return aggregatorProviders.findIndex((entry) => {
      const candidate = normalizeString(entry.name ?? entry.fn?.name ?? '');
      return candidate.toLowerCase() === lookup;
    });
  }

  return -1;
}

function coerceObjectArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === 'object');
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
}

function resolveSourceLabel(itemSource, entry) {
  const normalized = normalizeString(itemSource);
  if (normalized) {
    if (normalized === 'HPE Buy') {
      return 'HPE Buy (buy.hpe.com)';
    }
    return normalized;
  }

  if (entry?.source) {
    return entry.source;
  }

  return 'Another';
}

function resolveProviderId(item, entry) {
  const candidate = normalizeString(item.provider ?? entry?.name ?? entry?.fn?.name ?? 'provider');
  return candidate || 'provider';
}

function resolvePartReference(item, fallback) {
  const direct = normalizeString(item.partNumber ?? item.part_number ?? '');
  if (direct) {
    return direct;
  }

  const payload = item.payload;
  if (payload && typeof payload === 'object') {
    const payloadValue = normalizeString(
      payload.partNumber ?? payload.part_number ?? payload.sku ?? ''
    );
    if (payloadValue) {
      return payloadValue;
    }
  }

  return fallback;
}

export function getAggregatorProviders() {
  return aggregatorProviders.map((entry) => entry.fn);
}

export function registerAggregatorProvider(provider, options = {}) {
  if (typeof provider !== 'function') {
    throw new TypeError('provider must be a function');
  }

  if (aggregatorProviders.some((entry) => entry.fn === provider)) {
    return;
  }

  const name = normalizeString(options.name ?? provider.name ?? '');
  const source = normalizeString(options.source ?? '');
  const entry = {
    fn: provider,
    name: name || undefined,
    source: source || undefined
  };

  const after = options.after;
  const index = findProviderIndex(after);
  if (index >= 0 && index < aggregatorProviders.length) {
    aggregatorProviders.splice(index + 1, 0, entry);
    return;
  }

  aggregatorProviders.push(entry);
}

async function runAggregatorProviders(partNumber, options = {}) {
  const results = [];

  for (const entry of aggregatorProviders) {
    try {
      const value = await entry.fn(partNumber, options);
      const objects = coerceObjectArray(value);

      for (const item of objects) {
        const source = resolveSourceLabel(item.source, entry);
        const providerId = resolveProviderId(item, entry);
        const partRef = resolvePartReference(item, partNumber);
        const enriched = {
          ...item,
          source,
          provider: providerId,
          partNumber: partRef
        };
        results.push(enriched);
      }
    } catch (error) {
      log.warn('Aggregator provider failed', {
        provider: providerEntryName(entry),
        partNumber,
        message: error?.message
      });
    }
  }

  return results;
}

function uniqueNormalizedParts(parts) {
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
      log.warn('Skipping invalid part number for aggregator pipeline', { value: part });
    }
  }

  return unique;
}

export async function aggregateProviders(partNumber, options = {}) {
  const normalized = normalizePartNumber(partNumber);
  return runAggregatorProviders(normalized, options);
}

export async function aggregateProvidersBatch(partNumbers, options = {}) {
  if (!Array.isArray(partNumbers)) {
    throw new TypeError('partNumbers must be an array');
  }

  const normalizedParts = uniqueNormalizedParts(partNumbers);
  const rows = [];

  for (const part of normalizedParts) {
    const items = await runAggregatorProviders(part, options);
    rows.push({ partNumber: part, items });
  }

  return rows;
}

async function aggregatorPartSurfer(partNumber, options = {}) {
  const payload = await runForPart(partNumber, options);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const canonical = normalizeString(payload.part_number ?? '') || partNumber;
  return {
    provider: 'partsurfer',
    partNumber: canonical,
    source: 'HPE PartSurfer',
    payload
  };
}

async function aggregatorBuyHpe(partNumber, options = {}) {
  const payload = await providerBuyHpe(partNumber, options);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = normalizeString(
    payload.partNumber ?? payload.part_number ?? payload.sku ?? ''
  );
  const canonical = candidate || partNumber;
  const source = resolveSourceLabel(payload.source, { source: 'HPE Buy (buy.hpe.com)' });

  return {
    provider: 'buy.hpe.com',
    partNumber: canonical,
    source,
    payload
  };
}

registerAggregatorProvider(aggregatorPartSurfer, {
  name: 'partsurfer',
  source: 'HPE PartSurfer'
});

registerAggregatorProvider(aggregatorBuyHpe, {
  name: 'buy.hpe.com',
  source: 'HPE Buy (buy.hpe.com)',
  after: 'partsurfer'
});

export {
  detectMode,
  runForPart,
  runBatch,
  parseSearch,
  parsePhoto,
  normalizePartNumber,
  fetchBuyHpe,
  parseBuyHpe,
  providerBuyHpe,
  exportCsvBuyHpe,
  VALID_PATTERN
};
