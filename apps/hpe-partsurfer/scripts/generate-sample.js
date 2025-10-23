const fs = require('fs');
const path = require('path');
const parseSearch = require('../src/parseSearch');
const parsePhoto = require('../src/parsePhoto');
const { writeCsv } = require('../src/csv');

function loadFixture(name) {
  return fs.readFileSync(
    path.join(__dirname, '..', '__tests__', 'fixtures', name),
    'utf8'
  );
}

function toRecord(partNumber, parsed) {
  return {
    part_number: partNumber,
    description: parsed.description || '',
    image_url: parsed.imageUrl || '',
    source_page: parsed.sourcePage,
    status: parsed.status
  };
}

async function main() {
  const records = [
    toRecord('511778-001', parseSearch(loadFixture('search_with_bom.html'))),
    toRecord('AF573A', parsePhoto(loadFixture('photo_success.html'))),
    toRecord('123456-B21', parseSearch(loadFixture('search_no_bom.html')))
  ];

  const outputPath = path.join(
    __dirname,
    '..',
    'artifacts',
    'sample-results.csv'
  );
  await writeCsv(outputPath, records);
  // eslint-disable-next-line no-console
  console.log(`Wrote sample results to ${outputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
