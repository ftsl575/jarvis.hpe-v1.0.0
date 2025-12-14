#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ExcelJS = require('exceljs');

const DEFAULT_INPUT = 'input.txt';
const DEFAULT_OUTPUT = 'output.xlsx';
const EXPORT_RULES = ['Return the most relevant marketing description for the SKU using only provided facts.'];
const FACT_SOURCE_LABELS = {
  partsurfer: 'PartSurfer',
  'buy.hpe.com': 'BuyHPE',
  productBulletin: 'Product Bulletin'
};

function parseArgs(argv) {
  const parsed = { in: DEFAULT_INPUT, out: DEFAULT_OUTPUT, limit: undefined, dryRun: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--in' && argv[index + 1]) {
      parsed.in = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--out' && argv[index + 1]) {
      parsed.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--limit' && argv[index + 1]) {
      const limitValue = Number.parseInt(argv[index + 1], 10);
      if (Number.isFinite(limitValue) && limitValue > 0) {
        parsed.limit = limitValue;
      }
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  return parsed;
}

function readInputLines(inputPath) {
  const content = fs.readFileSync(inputPath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function ensureDirectoryForFile(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const inputSheet = workbook.addWorksheet('input_rows');
  inputSheet.columns = [
    { header: 'PN', key: 'PN', width: 20 },
    { header: 'PN_normalized', key: 'PN_normalized', width: 20 },
    { header: 'Source_PartSurfer_title', key: 'Source_PartSurfer_title', width: 30 },
    { header: 'Source_PartSurfer_desc', key: 'Source_PartSurfer_desc', width: 40 },
    { header: 'Source_BuyHPE_title', key: 'Source_BuyHPE_title', width: 30 },
    { header: 'Source_BuyHPE_desc', key: 'Source_BuyHPE_desc', width: 40 },
    { header: 'Source_ProductBulletin_title', key: 'Source_ProductBulletin_title', width: 30 },
    { header: 'Source_ProductBulletin_desc', key: 'Source_ProductBulletin_desc', width: 40 },
    { header: 'Chosen_description', key: 'Chosen_description', width: 40 },
    { header: 'Description_quality', key: 'Description_quality', width: 20 },
    { header: 'Warehouse_ready', key: 'Warehouse_ready', width: 15 },
    { header: 'Notes', key: 'Notes', width: 80 }
  ];

  const summarySheet = workbook.addWorksheet('unique_pn');
  summarySheet.columns = [
    { header: 'PN_normalized', key: 'PN_normalized', width: 25 },
    { header: 'count_in_input', key: 'count_in_input', width: 15 }
  ];

  return { workbook, inputSheet, summarySheet };
}

function noteError(notes, label, error) {
  const details = error instanceof Error ? error.message : String(error);
  notes.push(`${label}: ${details}`);
  // eslint-disable-next-line no-console
  console.error(`${label}:`, details);
}

function selectChosenDescription(candidateDescriptions) {
  const nonEmpty = candidateDescriptions.filter((value) => typeof value === 'string' && value.trim().length > 0);
  if (nonEmpty.length > 0) {
    return { description: nonEmpty[0].trim(), quality: 'EXACT' };
  }
  return { description: '', quality: 'REQUIRED' };
}

function disableLlmInDryRun() {
  const openAi = process.env.OPENAI_API_KEY;
  const deepSeek = process.env.DEEPSEEK_API_KEY;
  if (!openAi && !deepSeek) {
    return () => {};
  }
  if (openAi) {
    process.env.OPENAI_API_KEY = '';
  }
  if (deepSeek) {
    process.env.DEEPSEEK_API_KEY = '';
  }
  return () => {
    if (openAi) {
      process.env.OPENAI_API_KEY = openAi;
    }
    if (deepSeek) {
      process.env.DEEPSEEK_API_KEY = deepSeek;
    }
  };
}

async function loadPartsModules() {
  const baseDir = path.resolve(__dirname, '..', 'apps', 'hpe-partsurfer', 'src');
  const indexUrl = pathToFileURL(path.join(baseDir, 'index.js')).href;
  const fetchUrl = pathToFileURL(path.join(baseDir, 'fetchBuyHpe.js')).href;
  const parseUrl = pathToFileURL(path.join(baseDir, 'parseBuyHpe.js')).href;

  const [indexModule, fetchModule, parseModule] = await Promise.all([
    import(indexUrl),
    import(fetchUrl),
    import(parseUrl)
  ]);

  return {
    normalizePartNumber: indexModule.normalizePartNumber,
    runForPart: indexModule.runForPart,
    providerBuyHpe: indexModule.providerBuyHpe,
    fetchBuyHpe: fetchModule.default ?? fetchModule.fetchBuyHpe,
    parseBuyHpe: parseModule.default ?? parseModule.parseBuyHpe
  };
}

function normalizeDescriptionValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\s+/g, ' ');
}

async function fetchPartSurfer(normalized, modules, options, notes) {
  if (options.dryRun) {
    notes.push('partsurfer: dry-run');
    return { title: '', desc: '' };
  }

  try {
    const payload = await modules.runForPart(normalized, { live: true, retries: 1 });
    return {
      title: normalizeDescriptionValue(payload?.description ?? ''),
      desc: normalizeDescriptionValue(payload?.description ?? '')
    };
  } catch (error) {
    noteError(notes, 'partsurfer', error);
    return { title: '', desc: '' };
  }
}

async function fetchBuyHpe(normalized, modules, options, notes) {
  if (options.dryRun) {
    notes.push('buyhpe: dry-run');
    return { title: '', desc: '' };
  }

  try {
    const payload = await modules.providerBuyHpe(normalized, { live: true, retries: 1 });
    return {
      title: normalizeDescriptionValue(payload?.title ?? ''),
      desc: normalizeDescriptionValue(
        payload?.marketingDescription ?? payload?.description ?? payload?.shortDescription ?? ''
      )
    };
  } catch (error) {
    noteError(notes, 'buyhpe', error);
    return { title: '', desc: '' };
  }
}

async function fetchProductBulletin(normalized, notes) {
  notes.push('product-bulletin: not available');
  return { title: '', desc: '' };
}

let cachedStrictFactsNormalize = null;
function loadStrictFactsNormalize() {
  if (cachedStrictFactsNormalize !== null) {
    return cachedStrictFactsNormalize;
  }

  require('ts-node/register/transpile-only');
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const adapter = require('../src/ai/unifiedAdapter');
  cachedStrictFactsNormalize = typeof adapter.strictFactsNormalize === 'function' ? adapter.strictFactsNormalize : null;
  return cachedStrictFactsNormalize;
}

function buildFactsMap(sources) {
  const facts = [];
  Object.entries(sources).forEach(([key, value]) => {
    const label = FACT_SOURCE_LABELS[key] ?? key;
    if (value.desc) {
      facts.push({ source: label, description: value.desc });
    }
  });
  return facts;
}

function summarizeDifferences(sources) {
  const entries = Object.entries(sources)
    .map(([key, value]) => ({ key, desc: value.desc }))
    .filter((entry) => entry.desc);

  if (entries.length <= 1) {
    return '';
  }

  const unique = new Map();
  entries.forEach((entry) => {
    const normalized = entry.desc.toLowerCase();
    if (!unique.has(normalized)) {
      unique.set(normalized, []);
    }
    unique.get(normalized).push(entry.key);
  });

  if (unique.size <= 1) {
    return 'sources aligned';
  }

  return Array.from(unique.entries())
    .map(([desc, keys]) => `${keys.map((key) => FACT_SOURCE_LABELS[key] ?? key).join('/')}: ${desc}`)
    .join(' || ');
}

async function chooseDescriptionWithStrictFacts({ pn, facts, notes }) {
  const strictFactsNormalize = loadStrictFactsNormalize();
  if (!strictFactsNormalize) {
    notes.push('strict-facts adapter unavailable');
    return null;
  }

  try {
    const response = await strictFactsNormalize({
      sku: pn,
      facts,
      rules: EXPORT_RULES
    });

    if (response && response.result && typeof response.result === 'object') {
      const resultObject = response.result;
      const possibleDescription = resultObject.description ?? resultObject.desc ?? resultObject.text;
      if (typeof possibleDescription === 'string' && possibleDescription.trim().length > 0) {
        return {
          description: normalizeDescriptionValue(possibleDescription),
          quality: 'STRICT-FACTS'
        };
      }
    }
  } catch (error) {
    noteError(notes, 'strict-facts', error);
  }
  return null;
}

async function collectRow(pn, modules, options) {
  const notes = [];
  let normalizedPn = pn;

  try {
    normalizedPn = modules.normalizePartNumber(pn);
  } catch (error) {
    noteError(notes, 'normalize', error);
    return {
      PN: pn,
      PN_normalized: '',
      Source_PartSurfer_title: '',
      Source_PartSurfer_desc: '',
      Source_BuyHPE_title: '',
      Source_BuyHPE_desc: '',
      Source_ProductBulletin_title: '',
      Source_ProductBulletin_desc: '',
      Chosen_description: '',
      Description_quality: 'INVALID',
      Warehouse_ready: 'NO',
      Notes: notes.join(' | ')
    };
  }

  const restoreEnv = options.dryRun ? disableLlmInDryRun() : () => {};
  try {
    const partSurfer = await fetchPartSurfer(normalizedPn, modules, options, notes);
    const buyHpe = await fetchBuyHpe(normalizedPn, modules, options, notes);
    const productBulletin = await fetchProductBulletin(normalizedPn, notes);

    const sources = {
      partsurfer: partSurfer,
      'buy.hpe.com': buyHpe,
      productBulletin
    };

    const facts = buildFactsMap(sources);
    const strictFactsResult = options.dryRun ? null : await chooseDescriptionWithStrictFacts({
      pn: normalizedPn,
      facts,
      notes
    });

    const candidateDescriptions = [partSurfer.desc, buyHpe.desc, productBulletin.desc, strictFactsResult?.description];
    const chosen = strictFactsResult ?? selectChosenDescription(candidateDescriptions);
    const diffSummary = summarizeDifferences(sources);

    if (diffSummary) {
      notes.push(`diff: ${diffSummary}`);
    }

    return {
      PN: pn,
      PN_normalized: normalizedPn,
      Source_PartSurfer_title: partSurfer.title,
      Source_PartSurfer_desc: partSurfer.desc,
      Source_BuyHPE_title: buyHpe.title,
      Source_BuyHPE_desc: buyHpe.desc,
      Source_ProductBulletin_title: productBulletin.title,
      Source_ProductBulletin_desc: productBulletin.desc,
      Chosen_description: chosen.description ?? '',
      Description_quality: chosen.quality ?? 'REQUIRED',
      Warehouse_ready: chosen.description ? 'YES' : 'NO',
      Notes: notes.join(' | ')
    };
  } finally {
    restoreEnv();
  }
}

async function writeSummarySheet(sheet, records) {
  const counts = new Map();
  records.forEach((record) => {
    const key = record.PN_normalized;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([pnNormalized, count]) => {
      sheet.addRow({ PN_normalized: pnNormalized, count_in_input: count });
    });
}

async function run() {
  const options = parseArgs(process.argv);
  const inputPath = path.resolve(process.cwd(), options.in);
  const outputPath = path.resolve(process.cwd(), options.out);

  if (!fs.existsSync(inputPath)) {
    // eslint-disable-next-line no-console
    console.error(`Input file not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const lines = readInputLines(inputPath);
  const limitedLines = typeof options.limit === 'number' ? lines.slice(0, options.limit) : lines;
  const modules = await loadPartsModules();
  const { workbook, inputSheet, summarySheet } = createWorkbook();

  const records = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const pn of limitedLines) {
    // eslint-disable-next-line no-await-in-loop
    const record = await collectRow(pn, modules, options);
    records.push(record);
    inputSheet.addRow(record);
  }

  await writeSummarySheet(summarySheet, records);

  ensureDirectoryForFile(outputPath);
  await workbook.xlsx.writeFile(outputPath);
}

run();
