/**
 * SQLite schema. One row per discovered screenshot in `assets`, at most one
 * row per analyzed screenshot in `results`, plus a small key/value table that
 * makes a scan resumable across app launches.
 */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
  id             TEXT PRIMARY KEY,
  uri            TEXT NOT NULL,
  filename       TEXT,
  width          INTEGER,
  height         INTEGER,
  creation_time  INTEGER,
  discovered_at  INTEGER NOT NULL,
  source         TEXT NOT NULL DEFAULT 'library',
  status         TEXT NOT NULL DEFAULT 'pending',
  priority       INTEGER NOT NULL DEFAULT 0,
  skip_reason    TEXT,
  probe_hash     TEXT,
  local_text     TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  processed_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_assets_queue
  ON assets(status, priority DESC, creation_time DESC);
CREATE INDEX IF NOT EXISTS idx_assets_probe_hash ON assets(probe_hash);
CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(creation_time DESC);

CREATE TABLE IF NOT EXISTS results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id       TEXT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  classification TEXT NOT NULL,
  category       TEXT NOT NULL,
  confidence     REAL NOT NULL DEFAULT 0,
  title          TEXT,
  subtitle       TEXT,
  summary        TEXT,
  starts_at      TEXT,
  ends_at        TEXT,
  place_name     TEXT,
  address        TEXT,
  url            TEXT,
  price          TEXT,
  due_at         TEXT,
  extracted_text TEXT,
  group_key      TEXT,
  raw_json       TEXT,
  completed_at   INTEGER,
  dismissed_at   INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_group ON results(group_key);
CREATE INDEX IF NOT EXISTS idx_results_inbox
  ON results(classification, completed_at, dismissed_at, created_at DESC);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export type AssetStatus =
  | 'pending'
  | 'processing'
  | 'analyzed'
  | 'skipped'
  | 'error';

export type Classification = 'ACTIONABLE' | 'NON_ACTIONABLE' | 'UNCERTAIN';

export type Category =
  | 'EVENT'
  | 'PLACE'
  | 'TASK'
  | 'PRODUCT'
  | 'INFO'
  | 'OTHER';

export const CATEGORY_LABELS: Record<Category, string> = {
  EVENT: 'Events',
  PLACE: 'Places',
  TASK: 'Tasks',
  PRODUCT: 'Products',
  INFO: 'Information',
  OTHER: 'Other',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  EVENT: '🎫',
  PLACE: '📍',
  TASK: '✅',
  PRODUCT: '🛍️',
  INFO: '💡',
  OTHER: '🗂️',
};

export interface AssetRow {
  id: string;
  uri: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  creation_time: number | null;
  discovered_at: number;
  source: string;
  status: AssetStatus;
  priority: number;
  skip_reason: string | null;
  probe_hash: string | null;
  local_text: string | null;
  attempts: number;
  last_error: string | null;
  processed_at: number | null;
}

export interface ResultRow {
  id: number;
  asset_id: string;
  classification: Classification;
  category: Category;
  confidence: number;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  starts_at: string | null;
  ends_at: string | null;
  place_name: string | null;
  address: string | null;
  url: string | null;
  price: string | null;
  due_at: string | null;
  extracted_text: string | null;
  group_key: string | null;
  raw_json: string | null;
  completed_at: number | null;
  dismissed_at: number | null;
  created_at: number;
}

/** A result joined with its screenshot, plus any duplicate siblings. */
export interface ResultCard extends ResultRow {
  asset_uri: string;
  asset_filename: string | null;
  asset_creation_time: number | null;
  duplicate_count: number;
}
