import * as MediaLibrary from 'expo-media-library';

import { META_KEYS, getMetaNumber } from '@/db/database';
import { discoverScreenshots } from './screenshotDiscovery';

/**
 * New-screenshot detection while the app is in the foreground.
 *
 * `MediaLibrary.addListener` fires whenever the photo library changes. The
 * listener itself does no analysis — it only runs the (cheap, metadata-only)
 * incremental discovery pass and tells the caller how many new screenshots
 * were queued, so the decision about *when* to spend battery on Gemini stays
 * in one place.
 */

export type NewScreenshotHandler = (queued: number) => void;

let subscription: MediaLibrary.Subscription | null = null;
let inFlight = false;

export function subscribeToNewScreenshots(
  onQueued: NewScreenshotHandler,
): () => void {
  if (subscription) subscription.remove();

  subscription = MediaLibrary.addListener(() => {
    void handleLibraryChange(onQueued);
  });

  return () => {
    subscription?.remove();
    subscription = null;
  };
}

async function handleLibraryChange(onQueued: NewScreenshotHandler): Promise<void> {
  // Library change events arrive in bursts; one pass at a time is enough.
  if (inFlight) return;
  inFlight = true;
  try {
    const queued = await discoverNewScreenshots();
    if (queued > 0) onQueued(queued);
  } catch {
    // A failed incremental pass is retried on the next library change.
  } finally {
    inFlight = false;
  }
}

/**
 * Enumerates only what appeared since the last pass, using the stored
 * high-water mark. Safe to call from a background task.
 *
 * @returns how many new screenshots were added to the queue.
 */
export async function discoverNewScreenshots(): Promise<number> {
  const since = await getMetaNumber(META_KEYS.lastDiscoveredCreationTime);
  const result = await discoverScreenshots({
    range: 'all',
    createdAfter: since,
  });
  return result.inserted;
}
