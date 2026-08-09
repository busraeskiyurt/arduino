import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGroupKey } from '../src/ai/classify.ts';
import {
  isAllDay,
  parseLocalDateTime,
  toCalendarDate,
  toCalendarUtc,
} from '../src/actions/datetime.ts';
import { scorePriority } from '../src/processing/prioritizer.ts';
import type { ScreenshotAnalysis } from '../src/ai/schema.ts';

/**
 * These cover the pure decision logic — the parts that decide what gets
 * analyzed first, what counts as a duplicate, and how an extracted date turns
 * into a calendar link. Everything else needs a device.
 */

function analysis(overrides: Partial<ScreenshotAnalysis> = {}): ScreenshotAnalysis {
  return {
    classification: 'ACTIONABLE',
    category: 'EVENT',
    confidence: 0.9,
    title: null,
    subtitle: null,
    summary: null,
    startsAt: null,
    endsAt: null,
    placeName: null,
    address: null,
    url: null,
    price: null,
    dueAt: null,
    extractedText: null,
    ...overrides,
  };
}

test('duplicate screenshots of one event share a group key', () => {
  const first = buildGroupKey(
    analysis({
      title: 'Jazz Night',
      startsAt: '2025-10-15T20:30',
      placeName: 'Nardis Jazz Club',
    }),
  );
  const second = buildGroupKey(
    analysis({
      title: 'JAZZ NIGHT!',
      startsAt: '2025-10-15T21:00',
      placeName: 'Nardis Jazz Club',
    }),
  );

  assert.equal(first, second);
});

test('different events do not collapse into one card', () => {
  const jazz = buildGroupKey(analysis({ title: 'Jazz Night', startsAt: '2025-10-15' }));
  const rock = buildGroupKey(analysis({ title: 'Rock Night', startsAt: '2025-10-15' }));

  assert.notEqual(jazz, rock);
});

test('non-actionable and untitled results are never grouped', () => {
  assert.equal(buildGroupKey(analysis({ classification: 'NON_ACTIONABLE', title: 'Meme' })), null);
  assert.equal(buildGroupKey(analysis({ title: null })), null);
});

test('recent, dense screenshots outrank old, sparse ones', () => {
  const recent = scorePriority({
    creationTime: Date.now() - 2 * 86_400_000,
    probeSize: 3000,
    localText: 'Concert on 15.10 at 20:30, Nardis Jazz Club',
    width: 1170,
    height: 2532,
  });
  const old = scorePriority({
    creationTime: Date.now() - 900 * 86_400_000,
    probeSize: 950,
    localText: 'lol',
    width: 1170,
    height: 2532,
  });

  assert.ok(recent > old, `expected ${recent} > ${old}`);
});

test('priority stays inside its bounds', () => {
  const score = scorePriority({
    creationTime: Date.now(),
    probeSize: 9000,
    localText: 'ticket booking 12.05 18:00 https://example.com ₺450 address Kadıköy'.repeat(8),
    width: 1170,
    height: 2532,
  });

  assert.ok(score >= 0 && score <= 200);
});

test('unknown metadata still produces a usable score', () => {
  const score = scorePriority({
    creationTime: null,
    probeSize: null,
    localText: null,
    width: null,
    height: null,
  });

  assert.equal(score, 50);
});

test('local wall-clock datetimes survive the round trip to Calendar', () => {
  const parsed = parseLocalDateTime('2025-10-15T20:30');
  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 2025);
  assert.equal(parsed.getMonth(), 9);
  assert.equal(parsed.getDate(), 15);
  assert.equal(parsed.getHours(), 20);
  assert.equal(parsed.getMinutes(), 30);

  // Calendar wants UTC basic format, which is timezone-shifted but instant-equal.
  assert.match(toCalendarUtc(parsed), /^\d{8}T\d{6}Z$/);
});

test('date-only values are treated as all-day', () => {
  assert.equal(isAllDay('2025-10-15'), true);
  assert.equal(isAllDay('2025-10-15T20:30'), false);

  const parsed = parseLocalDateTime('2025-10-15');
  assert.ok(parsed);
  assert.equal(toCalendarDate(parsed), '20251015');
});

test('unparseable dates are rejected rather than guessed', () => {
  assert.equal(parseLocalDateTime('next friday'), null);
  assert.equal(parseLocalDateTime(null), null);
});
