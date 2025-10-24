#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { log } from './logger.js';
import { runBatch } from './runner.js';
import { normalizePartNumber } from './normalize.js';

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input' || value === '-i') {
      args.input = argv[index + 1];
      index += 1;
    } else if (value === '--out' || value === '-o') {
      args.out = argv[index + 1];
      index += 1;
    } else if (value === '--live') {
      args.live = true;
    }
  }

  return args;
}

function uniqueNormalized(parts) {
  const seen = new Set();
  const result = [];

  for (const part of parts) {
    try {
      const normalized = normalizePartNumber(part);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch (error) {
      // Skip invalid entries silently; they cannot be normalized.
    }
  }

  return result;
}

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

async function main() {
  const { input, out, live: liveFlag } = parseArgs(process.argv.slice(2));

  if (!input || !out) {
    throw new Error('Usage: node src/cli.js --input <file> --out <file> [--live]');
  }

  const live = liveFlag ?? config.LIVE_MODE;
  if (!live) {
    console.warn('Live mode disabled; no network requests will be performed.');
  }

  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), out);

  const contents = await fs.readFile(inputPath, 'utf8');
  const parts = contents
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const normalizedParts = uniqueNormalized(parts);
  log.info('CLI processing', { count: normalizedParts.length, live });
  const rows = await runBatch(normalizedParts, { live });

  const header = ['part_number', 'description', 'image_url', 'source_page', 'status', 'replaced_by', 'substitute', 'bom_count', 'compatible_count'];
  const csvLines = [header, ...rows.map((row) => [
    toCsvValue(row.part_number),
    toCsvValue(row.description),
    toCsvValue(row.image_url),
    toCsvValue(row.source_page),
    toCsvValue(row.status),
    toCsvValue(row.replaced_by),
    toCsvValue(row.substitute),
    toCsvValue(row.bom_count),
    toCsvValue(row.compatible_count)
  ])].map((cols) => cols.join(','));

  await fs.writeFile(outputPath, `${csvLines.join('\n')}\n`, 'utf8');
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
