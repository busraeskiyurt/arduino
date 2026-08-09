/**
 * Priority scoring — decides *which* screenshots get analyzed first.
 *
 * The score is intentionally cheap and metadata-driven: recency, information
 * density from the local probe, and (when an on-device OCR module is
 * registered) actionable keywords. It never removes anything from the queue,
 * it only reorders it, so a low score just means "later", never "never".
 */

/** Patterns that suggest a screenshot is worth acting on. */
const SIGNAL_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  // Dates and times — events, deadlines, bookings.
  { pattern: /\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/, weight: 25 },
  { pattern: /\b\d{1,2}:\d{2}\b/, weight: 20 },
  {
    pattern:
      /\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/i,
    weight: 18,
  },
  // Money and products.
  { pattern: /(₺|\$|€|£)\s?\d|[\d.,]+\s?(tl|try|usd|eur)\b/i, weight: 18 },
  // Places.
  {
    pattern:
      /\b(address|adres|street|sokak|cadde|mah\.|mahalle|no:|floor|kat:|restaurant|cafe|kafe|hotel|otel)\b/i,
    weight: 20,
  },
  // Links and codes.
  { pattern: /\b(https?:\/\/|www\.)\S+/i, weight: 15 },
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, weight: 12 },
  // Bookings, tickets, deadlines.
  {
    pattern:
      /\b(ticket|bilet|booking|rezervasyon|reservation|confirmation|onay|deadline|son tarih|teslim|due|appointment|randevu|invoice|fatura|order|sipariş|flight|uçuş|pnr|gate|kapı)\b/i,
    weight: 28,
  },
  { pattern: /\b(event|etkinlik|concert|konser|festival|sergi|exhibition)\b/i, weight: 22 },
];

/** Patterns that suggest the screenshot is unlikely to be actionable. */
const NOISE_PATTERNS: RegExp[] = [
  /\b(lol|lmao|meme|haha+|😂|🤣)\b/i,
  /\b(story|reels?|tiktok|snapchat)\b/i,
];

export interface PriorityInput {
  creationTime: number | null;
  /** Base64 length of the tiny probe JPEG — a proxy for information density. */
  probeSize: number | null;
  /** Locally recognized text, when an OCR module is available. */
  localText: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Scores a screenshot from roughly 0 (analyze last) to 200 (analyze first).
 */
export function scorePriority(input: PriorityInput): number {
  let score = 50;

  // Recency: a screenshot from this week is far more likely to still matter
  // than one from three years ago.
  if (input.creationTime) {
    const ageDays = (Date.now() - input.creationTime) / 86_400_000;
    if (ageDays <= 7) score += 40;
    else if (ageDays <= 30) score += 30;
    else if (ageDays <= 90) score += 20;
    else if (ageDays <= 365) score += 10;
  }

  // Information density: a dense screenshot compresses worse than a flat one.
  if (input.probeSize !== null) {
    if (input.probeSize > 2600) score += 20;
    else if (input.probeSize > 1600) score += 10;
    else if (input.probeSize < 1100) score -= 15;
  }

  // Very wide images are usually not phone screenshots.
  if (input.width && input.height && input.width > input.height * 1.2) {
    score -= 10;
  }

  const text = input.localText;
  if (text) {
    for (const { pattern, weight } of SIGNAL_PATTERNS) {
      if (pattern.test(text)) score += weight;
    }
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(text)) score -= 20;
    }
    // Long text is a good sign; a two-word screenshot rarely is.
    if (text.length > 200) score += 10;
    else if (text.length < 12) score -= 20;
  }

  return Math.max(0, Math.min(200, Math.round(score)));
}
