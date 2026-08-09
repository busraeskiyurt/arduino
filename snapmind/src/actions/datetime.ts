/**
 * Date helpers shared by the action adapters.
 *
 * Gemini returns local wall-clock strings (`2025-10-15T20:30`), which is what
 * a poster actually says. They are converted to the device's local time and
 * then to the UTC basic format Google Calendar expects.
 */

export function parseLocalDateTime(value: string | null): Date | null {
  if (!value) return null;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when the source string carried no time component. */
export function isAllDay(value: string | null): boolean {
  return !!value && !/[T ]\d{2}:\d{2}/.test(value);
}

/** `20251015T173000Z` — the format Calendar's template URL wants. */
export function toCalendarUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** `20251015` — used for all-day events. */
export function toCalendarDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** RFC 3339 UTC, which the Google Tasks API requires for due dates. */
export function toRfc3339(date: Date): string {
  return date.toISOString();
}

export function formatForDisplay(value: string | null): string | null {
  const date = parseLocalDateTime(value);
  if (!date) return value;

  const dayPart = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
  if (isAllDay(value)) return dayPart;

  const timePart = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dayPart} · ${timePart}`;
}
