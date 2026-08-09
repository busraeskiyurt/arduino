import { create } from 'zustand';

import type { ScanRange } from '@/config';
import { META_KEYS, getMetaNumber, setMeta } from '@/db/database';
import { getScanStats, type ScanStats } from '@/db/repositories';
import { discoverScreenshots } from '@/discovery/screenshotDiscovery';
import { maybeNotify } from '@/notifications/notifier';
import {
  BLOCK_REASON_MESSAGES,
  checkConditions,
  type BlockReason,
} from '@/processing/conditions';
import { isQueueRunning, runQueue } from '@/processing/queue';

/**
 * Scan orchestration and the state the UI renders from.
 *
 * A scan is two phases that overlap: discovery keeps walking the photo library
 * while the queue is already analyzing what discovery has found. That is what
 * makes results appear within the first few seconds instead of after the whole
 * library has been enumerated.
 */

export type ScanPhase = 'idle' | 'discovering' | 'analyzing' | 'paused' | 'blocked';

interface ScanState {
  phase: ScanPhase;
  range: ScanRange;
  discovered: number;
  processed: number;
  analyzed: number;
  skipped: number;
  failed: number;
  blockReason: BlockReason;
  blockMessage: string | null;
  lastScanFinishedAt: number | null;
  stats: ScanStats | null;
  /** Bumped whenever new results land, so lists can refetch. */
  resultsVersion: number;

  startScan: (range: ScanRange, options?: { notify?: boolean }) => Promise<void>;
  pauseScan: () => void;
  resumeScan: () => Promise<void>;
  refreshStats: () => Promise<void>;
  bumpResults: () => void;
}

/**
 * Pause is a plain module-level flag rather than store state: the queue's
 * `shouldContinue` callback is polled between items and must see the newest
 * value without waiting for a React render.
 */
let pauseRequested = false;
let stopDiscovery = false;

export const useScanStore = create<ScanState>((set, get) => ({
  phase: 'idle',
  range: 'all',
  discovered: 0,
  processed: 0,
  analyzed: 0,
  skipped: 0,
  failed: 0,
  blockReason: null,
  blockMessage: null,
  lastScanFinishedAt: null,
  stats: null,
  resultsVersion: 0,

  bumpResults: () => set((s) => ({ resultsVersion: s.resultsVersion + 1 })),

  refreshStats: async () => {
    const [stats, lastScanFinishedAt] = await Promise.all([
      getScanStats(),
      getMetaNumber(META_KEYS.lastScanFinishedAt),
    ]);
    set({ stats, lastScanFinishedAt });
  },

  startScan: async (range, options = {}) => {
    if (get().phase !== 'idle' && get().phase !== 'paused') return;

    pauseRequested = false;
    stopDiscovery = false;

    // A tap on "Start Scan" is explicit, so the global pause toggle does not
    // block it — but Wi-Fi-only still does, because that is about cost.
    const blocked = await checkConditions({ respectPause: false });
    if (blocked) {
      set({
        phase: 'blocked',
        blockReason: blocked,
        blockMessage: BLOCK_REASON_MESSAGES[blocked],
      });
      return;
    }

    set({
      phase: 'discovering',
      range,
      blockReason: null,
      blockMessage: null,
      processed: 0,
      analyzed: 0,
      skipped: 0,
      failed: 0,
    });
    await setMeta(META_KEYS.scanRange, range);

    // Discovery runs unawaited so analysis can start on the first page.
    let discoveryDone = false;
    const discovery = discoverScreenshots({
      range,
      onProgress: ({ found }) => set({ discovered: found }),
      shouldStop: () => stopDiscovery,
    })
      .catch(() => undefined)
      .finally(() => {
        discoveryDone = true;
      });

    set({ phase: 'analyzing' });

    const totals = { processed: 0, analyzed: 0, skipped: 0, failed: 0 };

    // The queue drains faster than discovery can fill it early on, so it is
    // restarted until discovery has finished and nothing pending is left.
    for (;;) {
      const summary = await runQueue({
        onEvent: (event) => {
          set({
            processed: totals.processed + event.processed,
            analyzed: totals.analyzed + event.analyzed,
            skipped: totals.skipped + event.skipped,
            failed: totals.failed + event.failed,
          });
          if (event.lastResult) {
            get().bumpResults();
            if (options.notify) {
              void maybeNotify(event.lastResult.input, event.lastResult.resultId);
            }
          }
        },
        shouldContinue: () => !pauseRequested,
      });

      totals.processed += summary.processed;
      totals.analyzed += summary.analyzed;
      totals.skipped += summary.skipped;
      totals.failed += summary.failed;

      if (summary.stoppedBecause === 'no_api_key') {
        stopDiscovery = true;
        set({ phase: 'blocked', blockMessage: 'Add a Gemini API key in Settings to analyze screenshots.' });
        break;
      }
      if (pauseRequested) break;
      if (discoveryDone) {
        const { pending } = await getScanStats();
        if (pending === 0) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    await discovery;

    if (get().phase === 'blocked') {
      // Leave the blocked message on screen; nothing else to update.
    } else if (pauseRequested) {
      set({ phase: 'paused' });
    } else {
      await setMeta(META_KEYS.lastScanFinishedAt, String(Date.now()));
      set({ phase: 'idle' });
    }
    await get().refreshStats();
  },

  pauseScan: () => {
    pauseRequested = true;
    stopDiscovery = true;
    set({ phase: 'paused' });
  },

  resumeScan: async () => {
    const { range } = get();
    set({ phase: 'idle' });
    await get().startScan(range);
  },
}));

export { isQueueRunning };
