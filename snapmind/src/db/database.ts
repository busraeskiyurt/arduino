import * as SQLite from 'expo-sqlite';

import { SCHEMA } from './schema';

const DB_NAME = 'snapmind.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens (and on first call migrates) the database. Every module goes through
 * this so the schema is guaranteed to exist before the first query, including
 * in background tasks that start without any UI.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}

/** Drops every row SnapMind stores. Used by Settings → Delete SnapMind Data. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    'DELETE FROM results; DELETE FROM assets; DELETE FROM meta; VACUUM;',
  );
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getMetaNumber(key: string): Promise<number | null> {
  const raw = await getMeta(key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export const META_KEYS = {
  /** Creation time of the newest asset seen by discovery, ms epoch. */
  lastDiscoveredCreationTime: 'discovery.last_creation_time',
  /** When the last full/incremental scan finished, ms epoch. */
  lastScanFinishedAt: 'scan.finished_at',
  /** Range the user picked for the current scan. */
  scanRange: 'scan.range',
  /** '1' once the user has been through onboarding. */
  onboarded: 'app.onboarded',
  /** '1' while automatic analysis is paused by the user. */
  autoAnalysisPaused: 'settings.auto_paused',
  /** '1' when analysis should only run on Wi-Fi. */
  wifiOnly: 'settings.wifi_only',
  /** '1' when new screenshots should be analyzed automatically. */
  autoAnalyzeNew: 'settings.auto_analyze_new',
  /** '1' when high-confidence findings may raise a notification. */
  notificationsEnabled: 'settings.notifications',
  /** Rolling notification budget bookkeeping. */
  notifyWindowStart: 'notify.window_start',
  notifyWindowCount: 'notify.window_count',
  /** Gemini concurrency override. */
  concurrency: 'settings.concurrency',
} as const;
