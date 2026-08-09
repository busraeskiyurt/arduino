import * as Notifications from 'expo-notifications';

import { CONFIG } from '@/config';
import { META_KEYS, getMeta, getMetaNumber, setMeta } from '@/db/database';
import type { ResultInput } from '@/db/repositories';
import { CATEGORY_ICONS } from '@/db/schema';

/**
 * Smart notifications.
 *
 * A bulk scan must never turn into a stream of alerts, so notifications are
 * gated three ways: only high-confidence ACTIONABLE findings qualify, only
 * newly detected screenshots (not the initial library sweep) request one, and
 * a rolling hourly budget caps whatever is left.
 */

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Consumes one slot from the rolling hourly budget, if any is left. */
async function takeNotificationSlot(): Promise<boolean> {
  const now = Date.now();
  const windowStart = (await getMetaNumber(META_KEYS.notifyWindowStart)) ?? 0;
  const count = (await getMetaNumber(META_KEYS.notifyWindowCount)) ?? 0;

  if (now - windowStart > 3_600_000) {
    await setMeta(META_KEYS.notifyWindowStart, String(now));
    await setMeta(META_KEYS.notifyWindowCount, '1');
    return true;
  }
  if (count >= CONFIG.maxNotificationsPerHour) return false;

  await setMeta(META_KEYS.notifyWindowCount, String(count + 1));
  return true;
}

/**
 * Notifies about a freshly analyzed screenshot when it is worth interrupting
 * the user for. Silently does nothing otherwise.
 */
export async function maybeNotify(
  result: ResultInput,
  resultId: number,
): Promise<boolean> {
  if (result.classification !== 'ACTIONABLE') return false;
  if (result.confidence < CONFIG.notifyMinConfidence) return false;
  if (!result.title) return false;

  const enabled = (await getMeta(META_KEYS.notificationsEnabled)) !== '0';
  if (!enabled) return false;

  const permitted = (await Notifications.getPermissionsAsync()).granted;
  if (!permitted) return false;

  if (!(await takeNotificationSlot())) return false;

  const icon = CATEGORY_ICONS[result.category] ?? '💡';
  const heading: Record<string, string> = {
    EVENT: 'SnapMind found an event',
    PLACE: 'SnapMind found a place',
    TASK: 'SnapMind found a task',
    PRODUCT: 'SnapMind found a product',
    INFO: 'SnapMind found something useful',
    OTHER: 'SnapMind found something',
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} ${heading[result.category] ?? heading.OTHER}`,
      body: [result.title, result.subtitle].filter(Boolean).join(' — '),
      data: { resultId },
    },
    trigger: null,
  });

  return true;
}
