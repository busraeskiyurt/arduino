import { CONFIG } from '@/config';
import { GeminiError, MissingApiKeyError, analyzeScreenshot } from '@/ai/gemini';
import { toResultInput } from '@/ai/classify';
import { resolveLocalUri } from '@/discovery/screenshotDiscovery';
import { META_KEYS, getMeta } from '@/db/database';
import {
  claimPendingBatch,
  findAnalyzedTwin,
  markAssetStatus,
  recordAttemptFailure,
  requeueStuckAssets,
  saveResult,
  updateAssetProbe,
  type ResultInput,
} from '@/db/repositories';
import type { AssetRow } from '@/db/schema';
import { buildUploadImage, probeScreenshot } from './prefilter';

/**
 * The processing queue.
 *
 * Screenshots are pulled from SQLite in small batches, analyzed with a bounded
 * number of parallel Gemini calls, and written back one at a time. Nothing is
 * held in memory across batches, so a 10,000-screenshot library costs the same
 * memory as a 20-screenshot one, and a kill at any moment loses at most one
 * batch of in-flight work.
 */

export type QueueState = 'idle' | 'running' | 'paused' | 'stopped';

export interface QueueEvent {
  processed: number;
  analyzed: number;
  skipped: number;
  failed: number;
  /** Emitted when a screenshot produced a card worth showing. */
  lastResult?: { assetId: string; resultId: number; input: ResultInput };
}

export interface QueueOptions {
  concurrency?: number;
  batchSize?: number;
  /** Stop after this many screenshots — used by time-boxed background runs. */
  maxItems?: number;
  onEvent?: (event: QueueEvent) => void;
  /** Checked between items; returning false pauses the run cleanly. */
  shouldContinue?: () => boolean | Promise<boolean>;
}

export interface QueueSummary extends QueueEvent {
  stoppedBecause: 'drained' | 'paused' | 'limit' | 'no_api_key';
}

let activeRun: Promise<QueueSummary> | null = null;

/** True while a queue run owns the pending assets. */
export function isQueueRunning(): boolean {
  return activeRun !== null;
}

/**
 * Runs the queue until it drains, is paused, or hits `maxItems`.
 *
 * Concurrent calls are coalesced: the second caller simply awaits the run that
 * is already in flight, so a background task waking up mid-scan cannot double
 * process anything.
 */
export function runQueue(options: QueueOptions = {}): Promise<QueueSummary> {
  if (activeRun) return activeRun;
  activeRun = executeQueue(options).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function executeQueue(options: QueueOptions): Promise<QueueSummary> {
  const concurrency = options.concurrency ?? (await resolvedConcurrency());
  const batchSize = options.batchSize ?? CONFIG.batchSize;

  const totals: QueueEvent = { processed: 0, analyzed: 0, skipped: 0, failed: 0 };
  let stoppedBecause: QueueSummary['stoppedBecause'] = 'drained';

  // Anything left in `processing` belongs to a run that died; take it back.
  await requeueStuckAssets();

  for (;;) {
    if (options.shouldContinue && !(await options.shouldContinue())) {
      stoppedBecause = 'paused';
      break;
    }
    if (options.maxItems && totals.processed >= options.maxItems) {
      stoppedBecause = 'limit';
      break;
    }

    const remaining = options.maxItems
      ? Math.min(batchSize, options.maxItems - totals.processed)
      : batchSize;
    const batch = await claimPendingBatch(remaining);
    if (batch.length === 0) break;

    let missingKey = false;

    await forEachWithConcurrency(batch, concurrency, async (asset) => {
      if (missingKey) {
        // Give the asset straight back rather than burning its attempts.
        await markAssetStatus(asset.id, 'pending');
        return;
      }
      try {
        const outcome = await processAsset(asset);
        totals.processed += 1;
        if (outcome.kind === 'analyzed') {
          totals.analyzed += 1;
          totals.lastResult = {
            assetId: asset.id,
            resultId: outcome.resultId,
            input: outcome.input,
          };
        } else {
          totals.skipped += 1;
        }
      } catch (error) {
        if (error instanceof MissingApiKeyError) {
          missingKey = true;
          await markAssetStatus(asset.id, 'pending');
          return;
        }
        totals.failed += 1;
        totals.processed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = !(error instanceof GeminiError) || error.retryable;
        if (retryable) {
          await recordAttemptFailure(asset.id, message, CONFIG.maxAttempts);
        } else {
          await markAssetStatus(asset.id, 'error', { error: message });
        }
      }
      options.onEvent?.({ ...totals });
    });

    if (missingKey) {
      stoppedBecause = 'no_api_key';
      break;
    }
  }

  return { ...totals, stoppedBecause };
}

type ProcessOutcome =
  | { kind: 'analyzed'; resultId: number; input: ResultInput }
  | { kind: 'skipped'; reason: string };

/** Local pre-filter → duplicate check → Gemini → persisted result. */
async function processAsset(asset: AssetRow): Promise<ProcessOutcome> {
  const localUri = (await resolveLocalUri(asset.id)) ?? asset.uri;

  const probe = await probeScreenshot({
    localUri,
    creationTime: asset.creation_time,
    width: asset.width,
    height: asset.height,
  });
  await updateAssetProbe(asset.id, probe.hash, probe.localText, probe.priority);

  if (probe.skipReason) {
    await markAssetStatus(asset.id, 'skipped', { skipReason: probe.skipReason });
    return { kind: 'skipped', reason: probe.skipReason };
  }

  // An identical screenshot we already paid for: reuse its analysis verbatim.
  if (probe.hash) {
    const twin = await findAnalyzedTwin(probe.hash, asset.id);
    if (twin) {
      const input: ResultInput = {
        assetId: asset.id,
        classification: twin.classification,
        category: twin.category,
        confidence: twin.confidence,
        title: twin.title,
        subtitle: twin.subtitle,
        summary: twin.summary,
        startsAt: twin.starts_at,
        endsAt: twin.ends_at,
        placeName: twin.place_name,
        address: twin.address,
        url: twin.url,
        price: twin.price,
        dueAt: twin.due_at,
        extractedText: twin.extracted_text,
        // Force a shared group so the copy never becomes a second card.
        groupKey: twin.group_key ?? `twin:${probe.hash}`,
        raw: twin.raw_json ? JSON.parse(twin.raw_json) : null,
      };
      const resultId = await saveResult(input);
      await markAssetStatus(asset.id, 'analyzed', { skipReason: 'duplicate' });
      return { kind: 'analyzed', resultId, input };
    }
  }

  const image = await buildUploadImage(localUri, asset.width, asset.height);
  if (!image) {
    await markAssetStatus(asset.id, 'skipped', { skipReason: 'unreadable' });
    return { kind: 'skipped', reason: 'unreadable' };
  }

  const analysis = await analyzeScreenshot(image);
  const input = toResultInput(asset.id, analysis);
  const resultId = await saveResult(input);
  await markAssetStatus(asset.id, 'analyzed');
  return { kind: 'analyzed', resultId, input };
}

async function resolvedConcurrency(): Promise<number> {
  const stored = await getMeta(META_KEYS.concurrency);
  const value = stored ? Number(stored) : NaN;
  return Number.isFinite(value) && value >= 1 && value <= 8
    ? value
    : CONFIG.concurrency;
}

/**
 * Runs `worker` over `items` with at most `limit` in flight. Keeps the API
 * call rate bounded without pulling in a dependency.
 */
async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}
