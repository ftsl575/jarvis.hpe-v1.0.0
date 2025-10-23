#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const minimist = require('minimist');
const { runForPart } = require('./runner');
const { writeCsv } = require('./csv');

async function readParts(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

async function processParts(parts) {
  const results = [];
  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runForPart(part);
    results.push(result);
  }
  return results;
}

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ['input', 'out'],
    alias: { i: 'input', o: 'out' }
  });

  if (args.help || args.h) {
    console.log('Usage: node src/cli.js --input <file> --out <file>');
    process.exit(0);
  }

  if (!args.input) {
    throw new Error('Missing required --input argument');
  }

  if (!args.out) {
    throw new Error('Missing required --out argument');
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.out);

  const parts = await readParts(inputPath);
  if (parts.length === 0) {
    console.warn('Input file does not contain any part numbers.');
    await writeCsv(outputPath, []);
    return;
  }

  const results = await processParts(parts);
  await writeCsv(outputPath, results);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
