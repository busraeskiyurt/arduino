import * as TaskManager from 'expo-task-manager';

import { discoverNewScreenshots } from '@/discovery/changeDetection';
import { maybeNotify } from '@/notifications/notifier';
import { checkConditions, loadSettings } from '@/processing/conditions';
import { runQueue } from '@/processing/queue';

/**
 * Background processing.
 *
 * The OS decides when this runs — SnapMind only says what it would like to do
 * when given a slot. Each run is deliberately small and bounded: pick up newly
 * created screenshots, analyze a handful of them, notify about anything
 * genuinely useful, then hand the CPU back.
 */

export const BACKGROUND_SCAN_TASK = 'snapmind.background-scan';

/** Screenshots analyzed per background wake-up. */
const BACKGROUND_ITEM_BUDGET = 15;

/**
 * `expo-background-task` needs a native build — it is absent from Expo Go, and
 * a static import there fails at startup. Loading it lazily keeps the rest of
 * the app (discovery, scanning, cards, actions) fully testable in Expo Go, with
 * only background wake-ups missing.
 */
type BackgroundTaskModule = typeof import('expo-background-task');

const BackgroundTask: BackgroundTaskModule | null = (() => {
  try {
    return require('expo-background-task') as BackgroundTaskModule;
  } catch {
    return null;
  }
})();

/** True when the OS-scheduled background scan is available on this build. */
export function isBackgroundScanSupported(): boolean {
  return BackgroundTask !== null;
}

// Result codes are plain numbers, so the task can still report a result even
// when the module itself is unavailable.
const RESULT_SUCCESS = 1;
const RESULT_FAILED = 2;

TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (settings.autoAnalysisPaused || !settings.autoAnalyzeNew) {
      return RESULT_SUCCESS;
    }

    // Respects the Wi-Fi-only setting; a background run is never urgent
    // enough to justify cellular data the user did not agree to.
    if (await checkConditions()) {
      return RESULT_SUCCESS;
    }

    await discoverNewScreenshots();

    await runQueue({
      maxItems: BACKGROUND_ITEM_BUDGET,
      onEvent: (event) => {
        if (event.lastResult) {
          void maybeNotify(event.lastResult.input, event.lastResult.resultId);
        }
      },
    });

    return RESULT_SUCCESS;
  } catch {
    return RESULT_FAILED;
  }
});

export async function registerBackgroundScan(): Promise<void> {
  // In Expo Go there is nothing to register; foreground scanning still works.
  if (!BackgroundTask) return;

  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;

  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
  if (registered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_SCAN_TASK, {
    // A floor, not a promise — the OS coalesces this with its own schedule.
    minimumInterval: 60,
  });
}

export async function unregisterBackgroundScan(): Promise<void> {
  if (!BackgroundTask) return;
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
  if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
}
