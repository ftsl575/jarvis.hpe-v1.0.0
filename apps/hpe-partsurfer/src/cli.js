#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
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
  const { input, out } = parseArgs(process.argv.slice(2));

  if (!input || !out) {
    throw new Error('Usage: node src/cli.js --input <file> --out <file>');
  }

  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), out);

  const contents = await fs.readFile(inputPath, 'utf8');
  const parts = contents
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const normalizedParts = uniqueNormalized(parts);
  const rows = await runBatch(normalizedParts, { throttleMs: 1000 });

  const header = ['part_number', 'description', 'image_url', 'source_page', 'status'];
  const csvLines = [header, ...rows.map((row) => [
    toCsvValue(row.part_number),
    toCsvValue(row.description),
    toCsvValue(row.image_url),
    toCsvValue(row.source_page),
    toCsvValue(row.status)
  ])].map((cols) => cols.join(','));

  await fs.writeFile(outputPath, `${csvLines.join('\n')}\n`, 'utf8');
}

const isMain = (() => {
  const current = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error.message);
    process.exitCode = 1;
  });
}
