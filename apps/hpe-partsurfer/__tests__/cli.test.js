const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const nock = require('nock');
const { BASE_URL } = require('../src/fetch');

const execFileAsync = util.promisify(execFile);

function loadFixture(name) {
  return fs.readFile(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('CLI', () => {
  it('processes input file, deduplicates parts and writes CSV', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
    const inputPath = path.join(tmpDir, 'parts.txt');
    const outputPath = path.join(tmpDir, 'results.csv');

    await fs.writeFile(inputPath, '511778-001\nAF573A\n511778-001\n', 'utf8');

    const [searchHtml, photoHtml] = await Promise.all([
      loadFixture('search_with_bom.html'),
      loadFixture('photo_success.html')
    ]);

    nock(BASE_URL)
      .get('/Search.aspx')
      .query({ SearchText: '511778-001' })
      .reply(200, searchHtml);
    nock(BASE_URL)
      .get('/ShowPhoto.aspx')
      .query({ partnumber: 'AF573A' })
      .reply(200, photoHtml);

    await execFileAsync(
      'node',
      ['src/cli.js', '--input', inputPath, '--out', outputPath],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HPE_PARTSURFER_THROTTLE_MS: '0'
        }
      }
    );

    const csv = await fs.readFile(outputPath, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 unique parts
    expect(lines[1]).toContain('511778-001');
    expect(lines[2]).toContain('AF573A');
  });
});
