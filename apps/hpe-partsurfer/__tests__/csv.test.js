const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { writeCsv, formatRecord, DEFAULT_HEADERS } = require('../src/csv');

describe('csv writer', () => {
  it('escapes values that contain commas or quotes', () => {
    const record = {
      part_number: '123',
      description: 'Value, with, commas',
      image_url: 'https://example.com/image.png',
      source_page: 'Search',
      status: 'ok'
    };
    expect(formatRecord(record, DEFAULT_HEADERS)).toBe(
      '123,"Value, with, commas",https://example.com/image.png,Search,ok'
    );
  });

  it('writes CSV file with headers and newline', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csv-test-'));
    const target = path.join(tmpDir, 'out.csv');
    const records = [
      {
        part_number: '511778-001',
        description: 'Cable',
        image_url: '',
        source_page: 'Search',
        status: 'ok'
      }
    ];
    await writeCsv(target, records);
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe(
      'part_number,description,image_url,source_page,status\n511778-001,Cable,,Search,ok\n'
    );
  });
});
