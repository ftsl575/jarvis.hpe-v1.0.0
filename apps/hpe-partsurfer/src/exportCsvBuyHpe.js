import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeWhitespace } from './html.js';

const HEADERS = [
  'partNumber',
  'title',
  'sku',
  'price',
  'priceCurrency',
  'availability',
  'url',
  'image',
  'source'
];

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function resolveValue(record, key) {
  if (!record || typeof record !== 'object') {
    return '';
  }
  if (key === 'source') {
    return 'HPE Buy';
  }
  const value = record[key];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return normalizeWhitespace(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return normalizeWhitespace(String(value));
}

function escapeCsvField(value) {
  const text = normalizeWhitespace(String(value ?? ''));
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function renderRows(records, delimiter) {
  const lines = [HEADERS.join(delimiter)];
  for (const record of ensureArray(records)) {
    const row = HEADERS.map((header) => escapeCsvField(resolveValue(record, header))).join(delimiter);
    lines.push(row);
  }
  return `${lines.join('\n')}\n`;
}

export async function exportCsvBuyHpe(records, options = {}) {
  const targetDir = options.directory
    ? path.resolve(options.directory)
    : path.resolve(process.cwd(), 'apps', 'hpe-partsurfer');
  const commaPath = options.commaPath || path.join(targetDir, 'sample_results.csv');
  const semicolonPath = options.semicolonPath || path.join(targetDir, 'sample_results_semicolon.csv');
  const commaContent = renderRows(records, ',');
  const semicolonContent = renderRows(records, ';');
  await writeFile(commaPath, commaContent, 'utf8');
  await writeFile(semicolonPath, semicolonContent, 'utf8');
  return { commaPath, semicolonPath };
}

export default exportCsvBuyHpe;
