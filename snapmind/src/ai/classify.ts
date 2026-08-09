import type { ResultInput } from '@/db/repositories';
import type { ScreenshotAnalysis } from './schema';

/**
 * Turns a raw analysis into the row we persist, including the group key used
 * for duplicate collapsing.
 */
export function toResultInput(
  assetId: string,
  analysis: ScreenshotAnalysis,
): ResultInput {
  return {
    assetId,
    classification: analysis.classification,
    category: analysis.category,
    confidence: analysis.confidence,
    title: analysis.title,
    subtitle: analysis.subtitle,
    summary: analysis.summary,
    startsAt: analysis.startsAt,
    endsAt: analysis.endsAt,
    placeName: analysis.placeName,
    address: analysis.address,
    url: analysis.url,
    price: analysis.price,
    dueAt: analysis.dueAt,
    extractedText: analysis.extractedText,
    groupKey: buildGroupKey(analysis),
    raw: analysis,
  };
}

/**
 * Semantic duplicate key.
 *
 * Three screenshots of the same concert produce three analyses with the same
 * title and date, so they collapse into one card. This is deliberately a
 * string-normalization trick rather than image clustering — the MVP does not
 * need computer vision to notice that "Jazz Night · Oct 15" appeared three
 * times.
 *
 * @returns `null` when the result is too vague to group safely, which leaves
 *          the card standing on its own.
 */
export function buildGroupKey(analysis: ScreenshotAnalysis): string | null {
  if (analysis.classification === 'NON_ACTIONABLE') return null;

  const title = normalize(analysis.title);
  if (!title || title.length < 3) return null;

  const day = (analysis.startsAt ?? analysis.dueAt ?? '').slice(0, 10);
  const place = normalize(analysis.placeName ?? analysis.address)?.slice(0, 24) ?? '';

  return [analysis.category, title.slice(0, 48), day, place].join('|');
}

function normalize(value: string | null): string | null {
  if (!value) return null;
  // Locale-invariant on purpose: Turkish casing maps "I" to "ı", which would
  // make the group key depend on how the original screenshot was capitalised.
  const cleaned = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
