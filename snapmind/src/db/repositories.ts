import { getDb } from './database';
import { CATEGORY_LABELS } from './schema';
import type {
  AssetRow,
  AssetStatus,
  Category,
  Classification,
  ResultCard,
  ResultRow,
} from './schema';

export interface DiscoveredAsset {
  id: string;
  uri: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  creationTime: number | null;
  source?: 'library' | 'manual';
}

/**
 * Inserts newly discovered screenshots. Existing rows are left untouched so a
 * re-scan never resets work that has already been done.
 *
 * @returns how many rows were actually new.
 */
export async function insertDiscoveredAssets(
  assets: DiscoveredAsset[],
): Promise<number> {
  if (assets.length === 0) return 0;
  const db = await getDb();
  const now = Date.now();
  let inserted = 0;

  await db.withTransactionAsync(async () => {
    for (const asset of assets) {
      const res = await db.runAsync(
        `INSERT OR IGNORE INTO assets
           (id, uri, filename, width, height, creation_time, discovered_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        asset.id,
        asset.uri,
        asset.filename,
        asset.width,
        asset.height,
        asset.creationTime,
        now,
        asset.source ?? 'library',
      );
      inserted += res.changes;
    }
  });

  return inserted;
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const db = await getDb();
  return db.getFirstAsync<AssetRow>('SELECT * FROM assets WHERE id = ?', id);
}

/**
 * Atomically claims the next batch of pending screenshots, highest priority
 * first. Claiming flips them to `processing` so a background task and the
 * foreground queue can never pick up the same asset twice.
 */
export async function claimPendingBatch(limit: number): Promise<AssetRow[]> {
  const db = await getDb();
  let claimed: AssetRow[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    claimed = await txn.getAllAsync<AssetRow>(
      `SELECT * FROM assets
        WHERE status = 'pending'
        ORDER BY priority DESC, creation_time DESC
        LIMIT ?`,
      limit,
    );
    if (claimed.length === 0) return;
    const placeholders = claimed.map(() => '?').join(',');
    await txn.runAsync(
      `UPDATE assets SET status = 'processing' WHERE id IN (${placeholders})`,
      ...claimed.map((a) => a.id),
    );
  });

  return claimed;
}

/**
 * Returns anything left mid-flight by a crash or a hard app kill back to the
 * queue. Called once on startup, before a scan resumes.
 */
export async function requeueStuckAssets(): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    "UPDATE assets SET status = 'pending' WHERE status = 'processing'",
  );
  return res.changes;
}

export async function updateAssetProbe(
  id: string,
  probeHash: string | null,
  localText: string | null,
  priority: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE assets SET probe_hash = ?, local_text = ?, priority = ? WHERE id = ?',
    probeHash,
    localText,
    priority,
    id,
  );
}

export async function markAssetStatus(
  id: string,
  status: AssetStatus,
  extra: { skipReason?: string | null; error?: string | null } = {},
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE assets
        SET status = ?, skip_reason = ?, last_error = ?, processed_at = ?
      WHERE id = ?`,
    status,
    extra.skipReason ?? null,
    extra.error ?? null,
    status === 'pending' ? null : Date.now(),
    id,
  );
}

/** Bumps the attempt counter and decides whether the asset gets another try. */
export async function recordAttemptFailure(
  id: string,
  error: string,
  maxAttempts: number,
): Promise<{ willRetry: boolean }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ attempts: number }>(
    'SELECT attempts FROM assets WHERE id = ?',
    id,
  );
  const attempts = (row?.attempts ?? 0) + 1;
  const willRetry = attempts < maxAttempts;
  await db.runAsync(
    `UPDATE assets
        SET attempts = ?, last_error = ?, status = ?, processed_at = ?
      WHERE id = ?`,
    attempts,
    error,
    willRetry ? 'pending' : 'error',
    willRetry ? null : Date.now(),
    id,
  );
  return { willRetry };
}

/**
 * Finds an already-analyzed screenshot with the same local probe hash — i.e.
 * a byte-identical duplicate. Lets the queue copy the existing result instead
 * of paying for a second Gemini call.
 */
export async function findAnalyzedTwin(
  probeHash: string,
  excludeAssetId: string,
): Promise<ResultRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ResultRow>(
    `SELECT r.* FROM results r
       JOIN assets a ON a.id = r.asset_id
      WHERE a.probe_hash = ? AND a.id != ?
      ORDER BY r.created_at ASC
      LIMIT 1`,
    probeHash,
    excludeAssetId,
  );
}

export interface ResultInput {
  assetId: string;
  classification: Classification;
  category: Category;
  confidence: number;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  placeName: string | null;
  address: string | null;
  url: string | null;
  price: string | null;
  dueAt: string | null;
  extractedText: string | null;
  groupKey: string | null;
  raw: unknown;
}

export async function saveResult(input: ResultInput): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO results
       (asset_id, classification, category, confidence, title, subtitle, summary,
        starts_at, ends_at, place_name, address, url, price, due_at,
        extracted_text, group_key, raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET
        classification = excluded.classification,
        category       = excluded.category,
        confidence     = excluded.confidence,
        title          = excluded.title,
        subtitle       = excluded.subtitle,
        summary        = excluded.summary,
        starts_at      = excluded.starts_at,
        ends_at        = excluded.ends_at,
        place_name     = excluded.place_name,
        address        = excluded.address,
        url            = excluded.url,
        price          = excluded.price,
        due_at         = excluded.due_at,
        extracted_text = excluded.extracted_text,
        group_key      = excluded.group_key,
        raw_json       = excluded.raw_json`,
    input.assetId,
    input.classification,
    input.category,
    input.confidence,
    input.title,
    input.subtitle,
    input.summary,
    input.startsAt,
    input.endsAt,
    input.placeName,
    input.address,
    input.url,
    input.price,
    input.dueAt,
    input.extractedText,
    input.groupKey,
    JSON.stringify(input.raw ?? null),
    Date.now(),
  );
  return res.lastInsertRowId;
}

const CARD_SELECT = `
  SELECT r.*,
         a.uri            AS asset_uri,
         a.filename       AS asset_filename,
         a.creation_time  AS asset_creation_time,
         g.dup            AS duplicate_count
    FROM ({{groups}}) g
    JOIN results r ON r.id = g.rep_id
    JOIN assets  a ON a.id = r.asset_id
`;

/**
 * Builds the grouped representative query. SQLite's bare-column rule makes the
 * `id` selected alongside `MAX(confidence)` come from the winning row, so each
 * duplicate group is represented by its most confident result.
 */
function groupedCards(where: string): string {
  const groups = `
    SELECT COALESCE(group_key, 'id:' || id) AS gk,
           MAX(confidence) AS best,
           id AS rep_id,
           COUNT(*) AS dup
      FROM results
     WHERE ${where}
     GROUP BY gk`;
  return CARD_SELECT.replace('{{groups}}', groups);
}

const INBOX_WHERE =
  "classification = 'ACTIONABLE' AND completed_at IS NULL AND dismissed_at IS NULL";

export async function getInboxCards(
  limit = 50,
  offset = 0,
  category?: Category,
): Promise<ResultCard[]> {
  const db = await getDb();
  // The grouped-representative subquery makes positional parameters awkward,
  // so the category is whitelisted against the known enum instead of bound.
  const safe = category && category in CATEGORY_LABELS ? category : null;
  const where = safe ? `${INBOX_WHERE} AND category = '${safe}'` : INBOX_WHERE;
  return db.getAllAsync<ResultCard>(
    `${groupedCards(where)} ORDER BY r.confidence DESC, r.created_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
}

/** Every result for a group, so the user can open each source screenshot. */
export async function getGroupMembers(card: ResultCard): Promise<ResultCard[]> {
  const db = await getDb();
  if (!card.group_key) {
    const single = await getCardById(card.id);
    return single ? [single] : [];
  }
  return db.getAllAsync<ResultCard>(
    `SELECT r.*, a.uri AS asset_uri, a.filename AS asset_filename,
            a.creation_time AS asset_creation_time, 1 AS duplicate_count
       FROM results r JOIN assets a ON a.id = r.asset_id
      WHERE r.group_key = ?
      ORDER BY r.created_at ASC`,
    card.group_key,
  );
}

export async function getCardById(id: number): Promise<ResultCard | null> {
  const db = await getDb();
  return db.getFirstAsync<ResultCard>(
    `SELECT r.*, a.uri AS asset_uri, a.filename AS asset_filename,
            a.creation_time AS asset_creation_time, 1 AS duplicate_count
       FROM results r JOIN assets a ON a.id = r.asset_id
      WHERE r.id = ?`,
    id,
  );
}

/**
 * Full-library search. Unlike the inbox this deliberately includes
 * NON_ACTIONABLE and UNCERTAIN results — nothing is ever discarded, it just
 * does not get a card.
 */
export async function searchResults(
  query: string,
  limit = 60,
): Promise<ResultCard[]> {
  const db = await getDb();
  const term = `%${query.trim()}%`;
  const where = `(title LIKE ? OR subtitle LIKE ? OR summary LIKE ?
                  OR place_name LIKE ? OR address LIKE ? OR extracted_text LIKE ?)`;
  return db.getAllAsync<ResultCard>(
    `${groupedCards(where)} ORDER BY r.confidence DESC, r.created_at DESC LIMIT ?`,
    term,
    term,
    term,
    term,
    term,
    term,
    limit,
  );
}

export async function markCardCompleted(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE results SET completed_at = ? WHERE id = ?',
    Date.now(),
    id,
  );
}

export async function markGroupCompleted(card: ResultCard): Promise<void> {
  const db = await getDb();
  if (card.group_key) {
    await db.runAsync(
      'UPDATE results SET completed_at = ? WHERE group_key = ? AND completed_at IS NULL',
      Date.now(),
      card.group_key,
    );
  } else {
    await markCardCompleted(card.id);
  }
}

export async function dismissCard(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE results SET dismissed_at = ? WHERE id = ?',
    Date.now(),
    id,
  );
}

export interface ScanStats {
  discovered: number;
  analyzed: number;
  pending: number;
  skipped: number;
  errored: number;
  actionable: number;
  nonActionable: number;
  uncertain: number;
  byCategory: Partial<Record<Category, number>>;
}

export async function getScanStats(): Promise<ScanStats> {
  const db = await getDb();

  const statuses = await db.getAllAsync<{ status: AssetStatus; n: number }>(
    'SELECT status, COUNT(*) AS n FROM assets GROUP BY status',
  );
  const classes = await db.getAllAsync<{
    classification: Classification;
    n: number;
  }>('SELECT classification, COUNT(*) AS n FROM results GROUP BY classification');
  const cats = await db.getAllAsync<{ category: Category; n: number }>(
    `SELECT category, COUNT(DISTINCT COALESCE(group_key, 'id:' || id)) AS n
       FROM results
      WHERE classification = 'ACTIONABLE'
      GROUP BY category`,
  );

  const byStatus = (s: AssetStatus) =>
    statuses.find((r) => r.status === s)?.n ?? 0;
  const byClass = (c: Classification) =>
    classes.find((r) => r.classification === c)?.n ?? 0;

  return {
    discovered: statuses.reduce((sum, r) => sum + r.n, 0),
    analyzed: byStatus('analyzed'),
    pending: byStatus('pending') + byStatus('processing'),
    skipped: byStatus('skipped'),
    errored: byStatus('error'),
    actionable: byClass('ACTIONABLE'),
    nonActionable: byClass('NON_ACTIONABLE'),
    uncertain: byClass('UNCERTAIN'),
    byCategory: Object.fromEntries(cats.map((c) => [c.category, c.n])),
  };
}
