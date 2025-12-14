#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DEFAULT_INPUT = 'input.txt';
const DEFAULT_OUTPUT = 'output.xlsx';

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

function normalizePn(value) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
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
    { header: 'Description_quality', key: 'Description_quality', width: 15 },
    { header: 'Warehouse_ready', key: 'Warehouse_ready', width: 15 },
    { header: 'Notes', key: 'Notes', width: 50 }
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
      rules: ['Return the most relevant description for the SKU if available.']
    });

    if (response && response.result && typeof response.result === 'object') {
      const resultObject = response.result;
      const possibleDescription = resultObject.description ?? resultObject.desc ?? resultObject.text;
      if (typeof possibleDescription === 'string' && possibleDescription.trim().length > 0) {
        return {
          description: possibleDescription.trim(),
          quality: 'EXACT'
        };
      }
    }
  } catch (error) {
    noteError(notes, 'strict-facts', error);
  }
  return null;
}

async function collectRow(pn, options) {
  const normalized = normalizePn(pn);
  const notes = [];

  if (options.dryRun) {
    notes.push('dry-run: sources skipped');
    return {
      PN: pn,
      PN_normalized: normalized,
      Source_PartSurfer_title: '',
      Source_PartSurfer_desc: '',
      Source_BuyHPE_title: '',
      Source_BuyHPE_desc: '',
      Source_ProductBulletin_title: '',
      Source_ProductBulletin_desc: '',
      Chosen_description: '',
      Description_quality: 'REQUIRED',
      Warehouse_ready: 'NO',
      Notes: notes.join(' | ')
    };
  }

  const facts = [];
  const partSurfer = { title: '', desc: '' };
  const buyHpe = { title: '', desc: '' };
  const productBulletin = { title: '', desc: '' };

  const strictFactsResult = await chooseDescriptionWithStrictFacts({
    pn: normalized,
    facts,
    notes
  });

  const candidateDescriptions = [
    partSurfer.desc,
    buyHpe.desc,
    productBulletin.desc,
    strictFactsResult?.description
  ];

  const chosen = strictFactsResult ?? selectChosenDescription(candidateDescriptions);

  return {
    PN: pn,
    PN_normalized: normalized,
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

  const { workbook, inputSheet, summarySheet } = createWorkbook();

  const records = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const pn of limitedLines) {
    // eslint-disable-next-line no-await-in-loop
    const record = await collectRow(pn, options);
    records.push(record);
    inputSheet.addRow(record);
  }

  await writeSummarySheet(summarySheet, records);

  ensureDirectoryForFile(outputPath);
  await workbook.xlsx.writeFile(outputPath);
}

run();
