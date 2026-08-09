import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { ResultCard } from '@/db/schema';
import {
  addDays,
  addHours,
  isAllDay,
  parseLocalDateTime,
  toCalendarDate,
  toCalendarUtc,
  toRfc3339,
} from './datetime';
import { getGoogleAccessToken, isGoogleAuthConfigured } from './googleAuth';

/**
 * Action adapters — the "ACT" end of DISCOVER → UNDERSTAND → ACT.
 *
 * Each Google service is one small function behind a shared `ActionSpec`, so
 * adding or replacing an integration touches nothing else in the app.
 */

export type ActionKind = 'calendar' | 'maps' | 'tasks' | 'browser' | 'copy';

export interface ActionSpec {
  kind: ActionKind;
  label: string;
  /** Completing this action clears the card out of the Action Inbox. */
  completesCard: boolean;
  run: () => Promise<ActionOutcome>;
}

export interface ActionOutcome {
  ok: boolean;
  message?: string;
}

/** Everything the user can do with a given card, best action first. */
export function actionsForCard(card: ResultCard): ActionSpec[] {
  const actions: ActionSpec[] = [];

  if (card.category === 'EVENT' && (card.starts_at || card.title)) {
    actions.push({
      kind: 'calendar',
      label: 'Add to Calendar',
      completesCard: true,
      run: () => openGoogleCalendar(card),
    });
  }

  if (card.category === 'PLACE' || card.place_name || card.address) {
    actions.push({
      kind: 'maps',
      label: 'Open in Maps',
      completesCard: true,
      run: () => openGoogleMaps(card),
    });
  }

  if (card.category === 'TASK' || card.due_at) {
    actions.push({
      kind: 'tasks',
      label: 'Add to Google Tasks',
      completesCard: true,
      run: () => addToGoogleTasks(card),
    });
  }

  if (card.url) {
    actions.push({
      kind: 'browser',
      label: 'Open link',
      completesCard: false,
      run: () => openUrl(card.url as string),
    });
  }

  actions.push({
    kind: 'copy',
    label: 'Copy details',
    completesCard: false,
    run: () => copyDetails(card),
  });

  return actions;
}

// ---------------------------------------------------------------- Calendar

export async function openGoogleCalendar(card: ResultCard): Promise<ActionOutcome> {
  const start = parseLocalDateTime(card.starts_at);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: card.title ?? 'Event',
  });

  if (start) {
    const allDay = isAllDay(card.starts_at);
    const end = parseLocalDateTime(card.ends_at) ?? (allDay ? addDays(start, 1) : addHours(start, 2));
    params.set(
      'dates',
      allDay
        ? `${toCalendarDate(start)}/${toCalendarDate(end)}`
        : `${toCalendarUtc(start)}/${toCalendarUtc(end)}`,
    );
  }

  const location = card.address ?? card.place_name;
  if (location) params.set('location', location);

  const details = [card.summary, card.url, 'Found by SnapMind in your screenshots.']
    .filter(Boolean)
    .join('\n\n');
  params.set('details', details);

  return openExternal(
    `https://calendar.google.com/calendar/render?${params.toString()}`,
  );
}

// -------------------------------------------------------------------- Maps

export async function openGoogleMaps(card: ResultCard): Promise<ActionOutcome> {
  const query = [card.place_name, card.address].filter(Boolean).join(' ');
  if (!query) return { ok: false, message: 'No location to open.' };

  const params = new URLSearchParams({ api: '1', query });
  return openExternal(`https://www.google.com/maps/search/?${params.toString()}`);
}

// ------------------------------------------------------------------- Tasks

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

/**
 * Creates a real task through the Tasks API when Google sign-in is configured,
 * and otherwise degrades to opening Google Tasks with the details on the
 * clipboard. The fallback keeps the feature usable with zero setup.
 */
export async function addToGoogleTasks(card: ResultCard): Promise<ActionOutcome> {
  if (!isGoogleAuthConfigured()) return tasksFallback(card);

  const token = await getGoogleAccessToken();
  if (!token) return tasksFallback(card);

  try {
    const due = parseLocalDateTime(card.due_at ?? card.starts_at);
    const response = await fetch(`${TASKS_API}/lists/@default/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: card.title ?? 'Task from SnapMind',
        notes: [card.summary, card.url].filter(Boolean).join('\n'),
        // The Tasks API stores dates only; the time component is ignored.
        ...(due ? { due: toRfc3339(due) } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, message: `Google Tasks rejected the request: ${body.slice(0, 120)}` };
    }
    return { ok: true, message: 'Added to Google Tasks.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not reach Google Tasks.',
    };
  }
}

async function tasksFallback(card: ResultCard): Promise<ActionOutcome> {
  await Clipboard.setStringAsync(describeCard(card));
  const opened = await openExternal('https://tasks.google.com/');
  return opened.ok
    ? { ok: true, message: 'Details copied — paste them into Google Tasks.' }
    : opened;
}

// ----------------------------------------------------------------- Generic

export async function openUrl(url: string): Promise<ActionOutcome> {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return openExternal(normalized);
}

async function copyDetails(card: ResultCard): Promise<ActionOutcome> {
  await Clipboard.setStringAsync(describeCard(card));
  return { ok: true, message: 'Copied to clipboard.' };
}

export function describeCard(card: ResultCard): string {
  return [
    card.title,
    card.subtitle,
    card.starts_at ? `When: ${card.starts_at}` : null,
    card.due_at ? `Due: ${card.due_at}` : null,
    card.place_name,
    card.address,
    card.price,
    card.url,
    card.summary,
  ]
    .filter(Boolean)
    .join('\n');
}

async function openExternal(url: string): Promise<ActionOutcome> {
  try {
    // Google's apps register these https URLs, so the native app wins when it
    // is installed and the in-app browser handles the rest.
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not open the link.',
    };
  }
}
