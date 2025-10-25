#!/usr/bin/env ts-node
import fs from 'node:fs/promises';
import path from 'node:path';

export interface CategoryRecord {
  category_code: string;
  display_name: string;
  description?: string;
}

export interface RegionMappingRecord {
  region_code: string;
  locale: string;
  category_code: string;
}

export interface FallbackMetadataRecord {
  metadata_key: string;
  metadata_value: string;
  notes?: string;
}

export interface ParsedData {
  categories: CategoryRecord[];
  regionMappings: RegionMappingRecord[];
  fallbackMetadata: FallbackMetadataRecord[];
}

export interface DatabaseAdapter {
  beginTransaction(): Promise<void>;
  exec(statement: string, parameters?: unknown[]): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class TransactionalMemoryAdapter implements DatabaseAdapter {
  public readonly statements: Array<{ statement: string; parameters?: unknown[] }> = [];
  private inTransaction = false;

  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
    this.statements.push({ statement: 'BEGIN' });
  }

  async exec(statement: string, parameters?: unknown[]): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('Transaction not started');
    }

    this.statements.push({ statement, parameters });
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      return;
    }

    this.inTransaction = false;
    this.statements.push({ statement: 'COMMIT' });
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return;
    }

    this.inTransaction = false;
    this.statements.push({ statement: 'ROLLBACK' });
  }
}

export async function parseSource(raw: string | null | undefined): Promise<ParsedData> {
  if (!raw) {
    return getDefaultData();
  }

  try {
    const parsed = JSON.parse(raw.toString()) as Partial<ParsedData>;
    return {
      categories: parsed.categories ?? getDefaultData().categories,
      regionMappings: parsed.regionMappings ?? getDefaultData().regionMappings,
      fallbackMetadata: parsed.fallbackMetadata ?? getDefaultData().fallbackMetadata
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse source payload, using default seed set.', error);
    return getDefaultData();
  }
}

function getDefaultData(): ParsedData {
  return {
    categories: [
      { category_code: 'SYS', display_name: 'Systems', description: 'Default systems category' },
      { category_code: 'STG', display_name: 'Storage', description: 'Default storage category' }
    ],
    regionMappings: [
      { region_code: 'NA', locale: 'en-US', category_code: 'SYS' },
      { region_code: 'EMEA', locale: 'en-GB', category_code: 'STG' }
    ],
    fallbackMetadata: [
      { metadata_key: 'support_contact', metadata_value: 'support@hpe.example.com' }
    ]
  };
}

export async function refreshDatabase(adapter: DatabaseAdapter, data: ParsedData): Promise<void> {
  await adapter.beginTransaction();

  try {
    await adapter.exec('DELETE FROM part_categories');
    await adapter.exec('DELETE FROM region_mappings');
    await adapter.exec('DELETE FROM fallback_metadata');

    for (const category of data.categories) {
      await adapter.exec('INSERT INTO part_categories(category_code, display_name, description) VALUES (?, ?, ?)', [
        category.category_code,
        category.display_name,
        category.description ?? null
      ]);
    }

    for (const mapping of data.regionMappings) {
      await adapter.exec('INSERT INTO region_mappings(region_code, locale, category_code) VALUES (?, ?, ?)', [
        mapping.region_code,
        mapping.locale,
        mapping.category_code
      ]);
    }

    for (const metadata of data.fallbackMetadata) {
      await adapter.exec('INSERT INTO fallback_metadata(metadata_key, metadata_value, notes) VALUES (?, ?, ?)', [
        metadata.metadata_key,
        metadata.metadata_value,
        metadata.notes ?? null
      ]);
    }

    await adapter.commit();
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

async function readSourcePayload(sourceArg?: string): Promise<string | null> {
  const explicitPath = sourceArg ?? process.env.SOURCE_URL;
  if (!explicitPath) {
    return null;
  }

  const filePath = explicitPath.startsWith('file:') ? explicitPath.replace('file:', '') : explicitPath;
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return fs.readFile(resolved, 'utf-8');
}

export async function main(argv = process.argv): Promise<void> {
  const sourceArg = argv[2];
  const raw = await readSourcePayload(sourceArg);
  const data = await parseSource(raw);
  const adapter = new TransactionalMemoryAdapter();

  await refreshDatabase(adapter, data);

  // eslint-disable-next-line no-console
  console.log(`Refreshed database with ${data.categories.length} categories.`);
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('HPE DB refresh failed', error);
    process.exitCode = 1;
  });
}
