const fs = require('fs');
const path = require('path');

const DEFAULT_HEADERS = [
  'part_number',
  'description',
  'image_url',
  'source_page',
  'status'
];

function escape(value) {
  const text = String(value ?? '');
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  if (/[",\n]/.test(text)) {
    return `"${text}"`;
  }
  return text;
}

function formatRecord(record, headers = DEFAULT_HEADERS) {
  return headers.map((header) => escape(record[header])).join(',');
}

async function writeCsv(filePath, records, headers = DEFAULT_HEADERS) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const lines = [headers.join(',')];
  for (const record of records) {
    lines.push(formatRecord(record, headers));
  }
  await fs.promises.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

module.exports = {
  DEFAULT_HEADERS,
  writeCsv,
  formatRecord
};
