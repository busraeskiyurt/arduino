/**
 * Central tuning knobs. Everything here is deliberately conservative by
 * default: SnapMind runs over thousands of screenshots, so the defaults favour
 * battery, network and API quota over raw speed.
 */
export const CONFIG = {
  /** How many screenshots are analyzed by Gemini in parallel. */
  concurrency: 3,
  /** How many assets the queue claims from SQLite per round-trip. */
  batchSize: 12,
  /** How many assets are pulled from the photo library per page during discovery. */
  discoveryPageSize: 200,
  /** Longest edge of the JPEG actually uploaded to Gemini. */
  uploadMaxEdge: 1024,
  uploadQuality: 0.7,
  /** Tiny thumbnail used for local pre-filtering (dedupe + information density). */
  probeWidth: 64,
  probeQuality: 0.4,
  /**
   * Base64 length below which a screenshot is considered "almost no content"
   * (a flat wallpaper, a blank page). Kept low on purpose — skipping a useful
   * screenshot is worse than one wasted API call.
   */
  lowInformationBase64Threshold: 900,
  /** Attempts before an asset is parked in the `error` state. */
  maxAttempts: 3,
  /** Minimum confidence for an ACTIONABLE result to raise a notification. */
  notifyMinConfidence: 0.75,
  /** Notification budget so a bulk scan can never spam the user. */
  maxNotificationsPerHour: 3,
  /** Gemini model used for screenshot understanding. */
  geminiModel: 'gemini-2.5-flash',
  geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  /** Backoff between retries of a failed Gemini call, in ms. */
  retryBaseDelayMs: 1500,
} as const;

export type ScanRange = 'all' | '7d' | '30d' | '90d';

export const SCAN_RANGE_LABELS: Record<ScanRange, string> = {
  all: 'All screenshots',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

export function scanRangeCutoff(range: ScanRange): number | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
