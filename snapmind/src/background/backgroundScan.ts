import * as BackgroundTask from 'expo-background-task';
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

TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (settings.autoAnalysisPaused || !settings.autoAnalyzeNew) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Respects the Wi-Fi-only setting; a background run is never urgent
    // enough to justify cellular data the user did not agree to.
    if (await checkConditions()) {
      return BackgroundTask.BackgroundTaskResult.Success;
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

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundScan(): Promise<void> {
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
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
  if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
}
