import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import ExcelJS from 'exceljs';

const execFileAsync = util.promisify(execFile);

function createTempPaths() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-input-'));
  const inputPath = path.join(tempDir, 'input.txt');
  const outputPath = path.join(tempDir, 'output.xlsx');
  return { tempDir, inputPath, outputPath };
}

describe('scripts/export-from-input.js', () => {
  it('generates workbook with expected sheets in dry-run', async () => {
    const { inputPath, outputPath } = createTempPaths();
    const lines = ['abc123', 'abc123', 'second-pn'];
    fs.writeFileSync(inputPath, `${lines.join('\n')}\n`);

    await execFileAsync('node', [
      path.join(__dirname, '..', 'scripts', 'export-from-input.js'),
      '--in',
      inputPath,
      '--out',
      outputPath,
      '--dry-run'
    ]);

    expect(fs.existsSync(outputPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);

    const inputSheet = workbook.getWorksheet('input_rows');
    expect(inputSheet).toBeDefined();
    const headerValues = inputSheet?.getRow(1).values as ExcelJS.CellValue[];
    const headerRow = (headerValues ?? []).slice(1);
    expect(headerRow).toEqual([
      'PN',
      'PN_normalized',
      'Source_PartSurfer_title',
      'Source_PartSurfer_desc',
      'Source_BuyHPE_title',
      'Source_BuyHPE_desc',
      'Source_ProductBulletin_title',
      'Source_ProductBulletin_desc',
      'Chosen_description',
      'Description_quality',
      'Warehouse_ready',
      'Notes'
    ]);

    expect((inputSheet?.actualRowCount ?? 1) - 1).toBe(lines.length);

    const summarySheet = workbook.getWorksheet('unique_pn');
    expect(summarySheet).toBeDefined();
    const summaryHeaderValues = summarySheet?.getRow(1).values as ExcelJS.CellValue[];
    const summaryHeader = (summaryHeaderValues ?? []).slice(1);
    expect(summaryHeader).toEqual(['PN_normalized', 'count_in_input']);

    const summaryRows = (summarySheet?.getSheetValues() ?? []).filter((row) => Array.isArray(row));
    const uniquePnRows = summaryRows.slice(1); // drop header
    expect(uniquePnRows).toHaveLength(2);
  });
});
