const fs = require('fs');
const path = require('path');
const { evaluatePartNumbers } = require('./index');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input') {
      args.input = value;
      i += 0;
    } else if (key === '--out') {
      args.out = value;
      i += 0;
    }
  }

  if (!args.input || !args.out) {
    throw new Error('Usage: node src/cli.js --input <file> --out <file>');
  }

  return {
    input: path.resolve(process.cwd(), args.input),
    out: path.resolve(process.cwd(), args.out)
  };
}

function readPartsFromFile(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function writeResultsToCsv(filePath, results) {
  const header = 'Input,Part Number,Status\n';
  const rows = results.map((entry) => `${entry.input},${entry.partNumber},${entry.status}`);
  fs.writeFileSync(filePath, header + rows.join('\n'));
}

function main(argv) {
  const paths = parseArgs(argv);
  const partNumbers = readPartsFromFile(paths.input);
  const results = evaluatePartNumbers(partNumbers);
  writeResultsToCsv(paths.out, results);
  return results;
}

if (require.main === module) {
  try {
    const results = main(process.argv);
    console.log(`Processed ${results.length} part numbers.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  readPartsFromFile,
  writeResultsToCsv,
  main
};
