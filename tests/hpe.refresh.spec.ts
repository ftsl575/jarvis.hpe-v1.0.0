import { parseSource, refreshDatabase, TransactionalMemoryAdapter } from '../scripts/hpe-db-refresh';

describe('HPE DB refresh script', () => {
  it('parses custom payloads while preserving defaults', async () => {
    const payload = JSON.stringify({
      categories: [
        { category_code: 'NEW', display_name: 'New Category' }
      ]
    });

    const parsed = await parseSource(payload);
    expect(parsed.categories[0].category_code).toBe('NEW');
    expect(parsed.regionMappings.length).toBeGreaterThan(0);
  });

  it('wraps mutations in a transaction', async () => {
    const adapter = new TransactionalMemoryAdapter();
    const parsed = await parseSource(null);

    await refreshDatabase(adapter, parsed);

    expect(adapter.statements[0].statement).toBe('BEGIN');
    expect(adapter.statements.at(-1)?.statement).toBe('COMMIT');
  });
});
