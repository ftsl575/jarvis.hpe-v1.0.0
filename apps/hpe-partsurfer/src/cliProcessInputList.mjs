import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { getSearchHtml, getPhotoHtml } from './fetch.js';
import { parseSearch } from './parseSearch.js';
import { absolutizeUrl, normalizePartNumber, normalizeText } from './normalize.js';
import { providerBuyHpe } from './providerBuyHpe.js';

const DEFAULT_INPUT_PATH = 'C:\\Users\\G\\Desktop\\jarvis.hpe v1.0.0\\input data\\list1.txt';
const DEFAULT_OUTPUT_PREFIX = 'C:\\Users\\G\\Desktop\\jarvis.hpe v1.0.0\\input data\\buyhpe_output';
const DEFAULT_SEARCH_BASE = 'https://partsurfer.hpe.com/Search.aspx?SearchText=';
const DEFAULT_PHOTO_BASE = 'https://partsurfer.hpe.com/ShowPhoto.aspx?partnumber=';
const CSV_HEADERS = [
  '#',
  'PartNumber',
  'PS_Title',
  'PSPhoto_Title',
  'BUY_Title',
  'PS_SKU',
  'PS_Category',
  'PS_Availability',
  'PS_URL',
  'PS_Image',
  'PS_Error',
  'PSPhoto_SKU',
  'PSPhoto_URL',
  'PSPhoto_Image',
  'PSPhoto_Error',
  'BUY_SKU',
  'BUY_URL',
  'BUY_Image',
  'BUY_Error'
];
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_BACKSLASH_PATTERN = /\\/;
const EOL = '\r\n';
const BOM = '\uFEFF';
const BUY_NOT_FOUND_URL = 'Product Not Found';
const PHOTO_PLACEHOLDER_PATTERN = /imagenotfound|placeholder|noimage/i;
const DENYLIST = new Set(['804329-002']);

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--in') {
      options.in = argv[index + 1];
      index += 1;
    } else if (current === '--out') {
      options.out = argv[index + 1];
      index += 1;
    } else if (current === '--live') {
      options.live = true;
    } else if (current === '--no-live') {
      options.live = false;
    }
  }

  return options;
}

function isWindowsAbsolute(value) {
  return WINDOWS_ABSOLUTE_PATTERN.test(value);
}

function resolvePath(value) {
  if (!value) {
    return value;
  }
  if (isWindowsAbsolute(value)) {
    return value;
  }
  return path.resolve(process.cwd(), value);
}

function resolveOutputDirectory(prefix) {
  if (!prefix) {
    return process.cwd();
  }
  if (WINDOWS_ABSOLUTE_PATTERN.test(prefix) || WINDOWS_BACKSLASH_PATTERN.test(prefix)) {
    const winDir = path.win32.dirname(prefix);
    if (winDir && winDir !== '.' && winDir !== prefix) {
      return winDir;
    }
  }
  return path.dirname(prefix);
}

function encodeQuery(value) {
  return encodeURIComponent(value ?? '');
}

function createEmptyRow(partNumber) {
  const row = {};
  for (const header of CSV_HEADERS) {
    row[header] = '';
  }
  row.PartNumber = partNumber ?? '';
  return row;
}

function toCsvValue(value, delimiter) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (text.length === 0) {
    return '';
  }
  if (
    text.includes('"')
    || text.includes('\n')
    || text.includes('\r')
    || text.includes(delimiter)
    || text.includes(';')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsvContent(rows, delimiter) {
  const lines = [CSV_HEADERS.join(delimiter)];
  for (const row of rows) {
    const values = CSV_HEADERS.map((header) => toCsvValue(row[header] ?? '', delimiter));
    lines.push(values.join(delimiter));
  }
  return `${BOM}${lines.join(EOL)}${EOL}`;
}

function extractPhotoDetails(html) {
  if (!html) {
    return { title: '', image: '' };
  }

  const $ = load(html);
  const title = normalizeText($('title').first().text());
  const imageElement = $('img')
    .filter((_, element) => {
      const src = $(element).attr('src');
      if (typeof src !== 'string') {
        return false;
      }
      const trimmed = src.trim();
      if (!trimmed) {
        return false;
      }
      return !PHOTO_PLACEHOLDER_PATTERN.test(trimmed);
    })
    .first();

  if (!imageElement || imageElement.length === 0) {
    return { title, image: '' };
  }

  const rawSrc = imageElement.attr('src') ?? '';
  const normalized = rawSrc.trim();
  const absolute = absolutizeUrl(normalized);
  return { title, image: absolute || normalized };
}

function hasPsData(row) {
  return Boolean((row.PS_Title && row.PS_Title.trim())
    || (row.PS_Category && row.PS_Category.trim())
    || (row.PS_Image && row.PS_Image.trim()));
}

function hasPhotoData(row) {
  return Boolean((row.PSPhoto_Title && row.PSPhoto_Title.trim())
    || (row.PSPhoto_Image && row.PSPhoto_Image.trim()));
}

function hasBuyData(row) {
  if (row.BUY_URL && row.BUY_URL.trim() && row.BUY_URL.trim() !== BUY_NOT_FOUND_URL) {
    return true;
  }
  return Boolean((row.BUY_Title && row.BUY_Title.trim()) || (row.BUY_Image && row.BUY_Image.trim()));
}

function allProvidersFailed(row) {
  return !hasPsData(row) && !hasPhotoData(row) && !hasBuyData(row);
}

function shouldAutoCorrect(partNumber) {
  return partNumber.endsWith('-002') && !DENYLIST.has(partNumber);
}

function markCheckManually(row, partNumber) {
  row.PartNumber = `${partNumber} (CHECK MANUALLY)`;
  row.PS_Error = 'CHECK MANUALLY';
  row.PSPhoto_Error = 'CHECK MANUALLY';
  row.BUY_URL = BUY_NOT_FOUND_URL;
  row.BUY_Error = 'CHECK MANUALLY';
}

function normalizePart(raw) {
  if (!raw) {
    return { normalized: '', error: 'invalid part number' };
  }
  try {
    const normalized = normalizePartNumber(raw);
    return { normalized };
  } catch (error) {
    return { normalized: raw.trim(), error: 'invalid part number' };
  }
}

async function fetchPartSurfer(partNumber, options, row) {
  row.PS_SKU = partNumber;
  row.PS_URL = `${DEFAULT_SEARCH_BASE}${encodeQuery(partNumber)}`;
  try {
    const html = await getSearchHtml(partNumber, options);
    const parsed = parseSearch(html);
    if (!parsed || parsed.notFound) {
      row.PS_Error = 'not found';
      return;
    }
    if (parsed.multipleResults) {
      row.PS_Error = 'multiple results';
      return;
    }
    row.PS_Title = parsed.description ? parsed.description.trim() : '';
    row.PS_Category = parsed.category ?? '';
    row.PS_Image = parsed.imageUrl ?? '';
    if (Array.isArray(parsed.bomItems) && parsed.bomItems.length > 0) {
      row.PS_Availability = `BOM items: ${parsed.bomItems.length}`;
    }
  } catch (error) {
    row.PS_Error = error?.code || error?.status || error?.message || 'error';
  }
}

async function fetchPartSurferPhoto(partNumber, options, row) {
  row.PSPhoto_SKU = partNumber;
  row.PSPhoto_URL = `${DEFAULT_PHOTO_BASE}${encodeQuery(partNumber)}`;
  try {
    const html = await getPhotoHtml(partNumber, options);
    const { title, image } = extractPhotoDetails(html);
    const hasTitle = title && title.length > 0;
    const hasImage = image && image.length > 0;
    if (!hasTitle && !hasImage) {
      row.PSPhoto_Error = 'not found';
      return;
    }
    row.PSPhoto_Title = hasTitle ? title : '';
    row.PSPhoto_Image = hasImage ? image : '';
  } catch (error) {
    if (error?.status === 404 || error?.status === 410 || error?.status === 403) {
      row.PSPhoto_Error = 'not found';
      return;
    }
    row.PSPhoto_Error = error?.code || error?.status || error?.message || 'error';
  }
}

async function fetchBuyHpe(partNumber, options, row) {
  try {
    const payload = await providerBuyHpe(partNumber, options);
    if (!payload) {
      row.BUY_URL = BUY_NOT_FOUND_URL;
      row.BUY_Error = 'not found';
      return;
    }
    row.BUY_Title = payload.title ?? '';
    row.BUY_SKU = payload.sku ?? payload.partNumber ?? partNumber;
    row.BUY_URL = payload.url ?? '';
    row.BUY_Image = payload.image ?? '';
  } catch (error) {
    if (error?.status === 404 || error?.status === 410 || error?.status === 403) {
      row.BUY_URL = BUY_NOT_FOUND_URL;
      row.BUY_Error = 'not found';
      return;
    }
    row.BUY_Error = error?.code || error?.status || error?.message || 'error';
  }
}

function finaliseProviderStates(row) {
  if (!row.PS_Title && !row.PS_Category && !row.PS_Image) {
    row.PS_Error = row.PS_Error || 'not found';
  }
  if (!row.PSPhoto_Title && !row.PSPhoto_Image) {
    row.PSPhoto_Error = row.PSPhoto_Error || 'not found';
  }
  const buyUrl = row.BUY_URL ? row.BUY_URL.trim() : '';
  if (!row.BUY_Title && !row.BUY_Image && (!buyUrl || buyUrl === BUY_NOT_FOUND_URL)) {
    row.BUY_URL = buyUrl || BUY_NOT_FOUND_URL;
    row.BUY_Error = row.BUY_Error || 'not found';
  }
}

async function buildRowForPart(partNumber, providerOptions) {
  const row = createEmptyRow(partNumber);
  row.PS_SKU = partNumber;
  row.PSPhoto_SKU = partNumber;
  row.BUY_SKU = partNumber;

  await fetchPartSurfer(partNumber, providerOptions, row);
  await fetchPartSurferPhoto(partNumber, providerOptions, row);
  await fetchBuyHpe(partNumber, providerOptions, row);

  finaliseProviderStates(row);
  return row;
}

async function processPart(partNumber, providerOptions) {
  const { normalized, error } = normalizePart(partNumber);
  const row = createEmptyRow(normalized);
  row.PS_SKU = normalized;
  row.PSPhoto_SKU = normalized;
  row.BUY_SKU = normalized;

  if (error) {
    row.PS_Error = error;
    row.PSPhoto_Error = error;
    row.BUY_Error = error;
    return row;
  }

  const initialRow = await buildRowForPart(normalized, providerOptions);

  if (!allProvidersFailed(initialRow)) {
    return initialRow;
  }

  if (shouldAutoCorrect(normalized)) {
    const alternate = normalized.replace(/-002$/, '-001');
    const alternateRow = await buildRowForPart(alternate, providerOptions);
    if (!allProvidersFailed(alternateRow)) {
      alternateRow.PartNumber = `${normalized} (auto change ${alternate})`;
      return alternateRow;
    }
  }

  markCheckManually(initialRow, normalized);
  return initialRow;
}

async function readInputList(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function ensureOutputDirectory(prefix) {
  const directory = resolveOutputDirectory(prefix);
  await fs.mkdir(directory, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolvePath(args.in ?? DEFAULT_INPUT_PATH);
  const outputPrefix = resolvePath(args.out ?? DEFAULT_OUTPUT_PREFIX);
  const live = typeof args.live === 'boolean' ? args.live : true;

  if (!live) {
    console.warn('Live mode disabled; providers may fail if network access is required.');
  }

  const items = await readInputList(inputPath);
  const providerOptions = { live };
  const rows = [];

  for (const item of items) {
    const row = await processPart(item, providerOptions);
    rows.push(row);
  }

  rows.forEach((row, index) => {
    row['#'] = String(index + 1);
  });

  await ensureOutputDirectory(outputPrefix);
  const commaPath = `${outputPrefix}.csv`;
  const semicolonPath = `${outputPrefix}_semicolon.csv`;
  const commaContent = buildCsvContent(rows, ',');
  const semicolonContent = buildCsvContent(rows, ';');
  await Promise.all([
    fs.writeFile(commaPath, commaContent, 'utf8'),
    fs.writeFile(semicolonPath, semicolonContent, 'utf8')
  ]);

  console.log(`Wrote ${rows.length} rows to ${commaPath}`);
  console.log(`Wrote ${rows.length} rows to ${semicolonPath}`);
}

const isMain = (() => {
  const current = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}

export {
  CSV_HEADERS,
  buildCsvContent,
  toCsvValue,
  allProvidersFailed,
  shouldAutoCorrect
};
