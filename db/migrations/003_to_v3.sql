-- Migration to database schema v3
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS part_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS region_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  category_code TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_code) REFERENCES part_categories(category_code)
);

CREATE TABLE IF NOT EXISTS fallback_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metadata_key TEXT NOT NULL UNIQUE,
  metadata_value TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_region_mappings_region ON region_mappings(region_code);
CREATE INDEX IF NOT EXISTS idx_region_mappings_category ON region_mappings(category_code);

COMMIT;
