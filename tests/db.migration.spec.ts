import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { SqlJsQueryResult } from 'sql.js';

describe('Database migration v3', () => {
  it('creates required tables', async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
    });
    const db = new SQL.Database();

    const applySql = async (relativePath: string) => {
      const sql = await fs.readFile(path.join(__dirname, '..', relativePath), 'utf-8');
      db.run(sql);
    };

    await applySql('db/schema/v3.sql');
    await applySql('db/migrations/003_to_v3.sql');

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.flatMap((table: SqlJsQueryResult) =>
      table.values.map((value: unknown[]) => String(value[0]))
    );

    expect(tableNames).toEqual(expect.arrayContaining(['part_categories', 'region_mappings', 'fallback_metadata']));
  });
});
