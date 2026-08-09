import * as Network from 'expo-network';

import { META_KEYS, getMeta, setMeta } from '@/db/database';

/**
 * Resource guards. Automatic analysis is only allowed to run when the user's
 * settings and the current network state both permit it — the default posture
 * is conservative on purpose.
 */

export interface SnapMindSettings {
  autoAnalysisPaused: boolean;
  wifiOnly: boolean;
  autoAnalyzeNew: boolean;
  notificationsEnabled: boolean;
  concurrency: number | null;
}

const DEFAULTS: SnapMindSettings = {
  autoAnalysisPaused: false,
  wifiOnly: true,
  autoAnalyzeNew: true,
  notificationsEnabled: true,
  concurrency: null,
};

export async function loadSettings(): Promise<SnapMindSettings> {
  const [paused, wifiOnly, autoNew, notify, concurrency] = await Promise.all([
    getMeta(META_KEYS.autoAnalysisPaused),
    getMeta(META_KEYS.wifiOnly),
    getMeta(META_KEYS.autoAnalyzeNew),
    getMeta(META_KEYS.notificationsEnabled),
    getMeta(META_KEYS.concurrency),
  ]);

  return {
    autoAnalysisPaused: bool(paused, DEFAULTS.autoAnalysisPaused),
    wifiOnly: bool(wifiOnly, DEFAULTS.wifiOnly),
    autoAnalyzeNew: bool(autoNew, DEFAULTS.autoAnalyzeNew),
    notificationsEnabled: bool(notify, DEFAULTS.notificationsEnabled),
    concurrency: concurrency ? Number(concurrency) : null,
  };
}

export async function saveSetting(
  key: keyof typeof META_KEYS,
  value: boolean | number,
): Promise<void> {
  await setMeta(
    META_KEYS[key],
    typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
  );
}

function bool(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  return raw === '1';
}

export type BlockReason = 'paused' | 'offline' | 'metered' | null;

/**
 * Decides whether analysis may run right now.
 *
 * A user-initiated scan can pass `respectPause: false` — tapping "Start Scan"
 * is an explicit instruction and should not be silently ignored because the
 * background toggle is off.
 */
export async function checkConditions(
  options: { respectPause?: boolean; respectWifi?: boolean } = {},
): Promise<BlockReason> {
  const { respectPause = true, respectWifi = true } = options;
  const settings = await loadSettings();

  if (respectPause && settings.autoAnalysisPaused) return 'paused';

  let state: Network.NetworkState;
  try {
    state = await Network.getNetworkStateAsync();
  } catch {
    return null; // Cannot tell — let the request itself fail if offline.
  }

  if (!state.isConnected || state.isInternetReachable === false) return 'offline';

  if (
    respectWifi &&
    settings.wifiOnly &&
    state.type !== Network.NetworkStateType.WIFI &&
    state.type !== Network.NetworkStateType.ETHERNET
  ) {
    return 'metered';
  }

  return null;
}

export const BLOCK_REASON_MESSAGES: Record<
  Exclude<BlockReason, null>,
  string
> = {
  paused: 'Automatic analysis is paused in Settings.',
  offline: 'Waiting for a network connection.',
  metered: 'Waiting for Wi-Fi — change this in Settings.',
};
