#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const BASE_DIR = path.resolve(__dirname, '..', 'data', 'hdd_matrix');
const FILES = {
  models: path.join(BASE_DIR, 'models.csv'),
  sku: path.join(BASE_DIR, 'sku.csv'),
  equiv: path.join(BASE_DIR, 'equiv.csv')
};

const modelSchema = z
  .object({
    model_number: z.string().min(1)
  })
  .passthrough();

const skuSchema = z
  .object({
    sku: z.string().min(1),
    model_number: z.string().min(1)
  })
  .passthrough();

const equivSchema = z
  .object({
    primary_sku: z.string().min(1),
    equivalent_sku: z.string().min(1)
  })
  .passthrough();

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = parseRow(lines[0]).map((cell) => cell.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const rawValues = parseRow(lines[i]);
    const record = {};
    header.forEach((key, index) => {
      record[key] = (rawValues[index] ?? '').trim();
    });
    rows.push(record);
  }

  return { header, rows };
}

function parseRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function normaliseRow(row) {
  const normalised = {};
  for (const [key, value] of Object.entries(row)) {
    const normalisedKey = key.trim().toLowerCase();
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    normalised[normalisedKey] = trimmedValue;
  }
  if (!normalised.model_number) {
    normalised.model_number = normalised.pn || normalised['product_number'] || '';
  }
  if (!normalised.sku) {
    normalised.sku = normalised['product_sku'] || normalised['part_number'] || '';
  }
  if (!normalised.primary_sku) {
    normalised.primary_sku =
      normalised['primary'] || normalised['sku_a'] || normalised['sku1'] || normalised['sku_left'] || normalised.sku || '';
  }
  if (!normalised.equivalent_sku) {
    normalised.equivalent_sku =
      normalised['equivalent'] || normalised['sku_b'] || normalised['sku2'] || normalised['sku_right'] || '';
  }
  return normalised;
}

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, header: [], rows: [] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseCSV(content);
  return { exists: true, ...parsed };
}

const showStats = process.argv.includes('--stats');

const metrics = {
  files: {
    models: false,
    sku: false,
    equiv: false
  },
  rows_total: 0,
  dup_count: 0,
  null_count: 0,
  equiv_inconsistencies: 0
};

const details = {
  duplicates: {
    models: [],
    sku: []
  },
  orphans: {
    sku_without_model: [],
    equiv_missing_sku: []
  },
  invalid_rows: {
    models: [],
    sku: [],
    equiv: []
  },
  asymmetry_pairs: []
};

const modelIds = new Map();
const skuIds = new Map();
const skuToModel = new Map();
const symmetricalPairs = new Map();

function trackDuplicate(map, key, bucket) {
  if (!key) {
    return;
  }
  const count = map.get(key) ?? 0;
  map.set(key, count + 1);
  if (count >= 1) {
    metrics.dup_count += 1;
    bucket.push(key);
  }
}

function recordNull(values, fileKey, identifier) {
  let nullsInRow = 0;
  values.forEach((value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      nullsInRow += 1;
    }
  });
  if (nullsInRow > 0) {
    metrics.null_count += nullsInRow;
    if (showStats) {
      details.invalid_rows[fileKey].push({ id: identifier, missing: nullsInRow });
    }
  }
}

function processModels() {
  const { exists, rows } = readCSV(FILES.models);
  metrics.files.models = exists;
  if (!exists) {
    return;
  }

  rows.forEach((row, index) => {
    const normalised = normaliseRow(row);
    const validation = modelSchema.safeParse(normalised);
    const identifier = normalised.model_number || `row_${index + 2}`;
    metrics.rows_total += 1;
    if (!validation.success) {
      metrics.null_count += 1;
      if (showStats) {
        details.invalid_rows.models.push({ id: identifier, issues: validation.error.issues });
      }
      return;
    }
    trackDuplicate(modelIds, validation.data.model_number, details.duplicates.models);
  });
}

function processSku() {
  const { exists, rows } = readCSV(FILES.sku);
  metrics.files.sku = exists;
  if (!exists) {
    return;
  }

  const modelsAvailable = metrics.files.models;

  rows.forEach((row, index) => {
    const normalised = normaliseRow(row);
    const validation = skuSchema.safeParse(normalised);
    const identifier = normalised.sku || `row_${index + 2}`;
    metrics.rows_total += 1;
    if (!validation.success) {
      metrics.null_count += 1;
      if (showStats) {
        details.invalid_rows.sku.push({ id: identifier, issues: validation.error.issues });
      }
      return;
    }
    const { sku, model_number: modelNumber } = validation.data;
    recordNull([sku, modelNumber], 'sku', identifier);
    trackDuplicate(skuIds, sku, details.duplicates.sku);
    skuToModel.set(sku, modelNumber);
    if (modelsAvailable && !modelIds.has(modelNumber)) {
      metrics.equiv_inconsistencies += 1;
      details.orphans.sku_without_model.push({ sku, model_number: modelNumber });
    }
  });
}

function processEquiv() {
  const { exists, rows } = readCSV(FILES.equiv);
  metrics.files.equiv = exists;
  if (!exists) {
    return;
  }

  const skusAvailable = metrics.files.sku;

  rows.forEach((row, index) => {
    const normalised = normaliseRow(row);
    const validation = equivSchema.safeParse(normalised);
    const identifier = `${normalised.primary_sku || 'row'}_${index + 2}`;
    metrics.rows_total += 1;
    if (!validation.success) {
      metrics.null_count += 1;
      if (showStats) {
        details.invalid_rows.equiv.push({ id: identifier, issues: validation.error.issues });
      }
      return;
    }
    const { primary_sku: primarySku, equivalent_sku: equivalentSku } = validation.data;
    recordNull([primarySku, equivalentSku], 'equiv', identifier);

    if (primarySku === equivalentSku) {
      metrics.equiv_inconsistencies += 1;
      details.asymmetry_pairs.push({ primarySku, equivalentSku, reason: 'self-reference' });
    }

    const hasPrimary = skuToModel.has(primarySku);
    const hasEquivalent = skuToModel.has(equivalentSku);
    if (skusAvailable && (!hasPrimary || !hasEquivalent)) {
      metrics.equiv_inconsistencies += 1;
      details.orphans.equiv_missing_sku.push({ primarySku, equivalentSku });
    }

    const canonical = [primarySku, equivalentSku].sort().join('::');
    const record = symmetricalPairs.get(canonical) ?? { directions: new Set() };
    record.directions.add(`${primarySku}->${equivalentSku}`);
    symmetricalPairs.set(canonical, record);
  });
}

processModels();
processSku();
processEquiv();

symmetricalPairs.forEach((value, key) => {
  if (value.directions.size !== 2) {
    const [a, b] = key.split('::');
    metrics.equiv_inconsistencies += 1;
    details.asymmetry_pairs.push({ primarySku: a, equivalentSku: b, reason: 'missing reciprocal pair' });
  }
});

const output = { ...metrics };
if (showStats) {
  output.details = details;
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = 0;
