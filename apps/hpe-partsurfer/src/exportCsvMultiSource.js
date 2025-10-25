import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_HEADERS = [
  'partNumber',
  'hpe.partsurfer',
  'hpe.partsurfer.photo',
  'hpe.buyhpe'
];

function toCsvValue(value, delimiter) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (text.length === 0) {
    return '';
  }

  const needsQuoting =
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text.includes(delimiter);

  if (!needsQuoting) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvLines(rows, delimiter, headers = DEFAULT_HEADERS) {
  const headerLine = headers.join(delimiter);
  const dataLines = rows.map((row) => {
    const values = [
      toCsvValue(row.partNumber ?? '', delimiter),
      toCsvValue(row.partsurfer ?? '', delimiter),
      toCsvValue(row.partsurferPhoto ?? '', delimiter),
      toCsvValue(row.buyHpe ?? '', delimiter)
    ];
    return values.join(delimiter);
  });

  return [headerLine, ...dataLines];
}

async function writeCsvFile(filePath, lines) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export async function exportCsvMultiSource(rows, options = {}) {
  if (!Array.isArray(rows)) {
    throw new TypeError('rows must be an array');
  }

  const { commaPath, semicolonPath, headers = DEFAULT_HEADERS } = options;
  if (!commaPath || !semicolonPath) {
    throw new Error('Both commaPath and semicolonPath must be provided');
  }

  const commaLines = buildCsvLines(rows, ',', headers);
  const semicolonLines = buildCsvLines(rows, ';', headers);

  await Promise.all([
    writeCsvFile(commaPath, commaLines),
    writeCsvFile(semicolonPath, semicolonLines)
  ]);

  return { commaPath, semicolonPath };
}

export default exportCsvMultiSource;
