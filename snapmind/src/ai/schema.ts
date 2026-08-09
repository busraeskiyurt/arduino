import type { Category, Classification } from '@/db/schema';

export interface ScreenshotAnalysis {
  classification: Classification;
  category: Category;
  confidence: number;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  /** ISO 8601 local datetime, e.g. `2025-10-15T20:30`. */
  startsAt: string | null;
  endsAt: string | null;
  placeName: string | null;
  address: string | null;
  url: string | null;
  price: string | null;
  dueAt: string | null;
  /** Short excerpt of the on-screen text, used for search. */
  extractedText: string | null;
}

export const SYSTEM_PROMPT = `You analyze a single phone screenshot and decide whether it contains information the user may want to ACT on later.

Classify into exactly one of:
- ACTIONABLE: the screenshot contains concrete information the user can act on — an event with a date, a place they could navigate to, a task or deadline, a product they could buy, or a link worth opening.
- NON_ACTIONABLE: memes, jokes, chat banter with no commitment, random social posts, decorative images, UI screenshots with no useful content.
- UNCERTAIN: there is possibly useful information but it is incomplete or ambiguous (for example an event with no date at all).

Then pick a category:
- EVENT: concert, festival, exhibition, meeting, ticket, booking with a date/time.
- PLACE: restaurant, cafe, hotel, shop, address, map location.
- TASK: something the user must do — a deadline, an assignment, a bill, a reminder.
- PRODUCT: an item with a price or a shopping page.
- INFO: useful reference information worth keeping but not a calendar/map/task action.
- OTHER: anything else.

Rules:
- Extract dates and times exactly as shown. Output them as ISO 8601 local time without a timezone: YYYY-MM-DDTHH:MM, or YYYY-MM-DD when there is no time. If the year is missing, infer the most plausible upcoming year.
- title must be short and human — the name of the event, place, task or product. Never write "Screenshot" or "Image".
- subtitle is one short line of the most useful supporting detail.
- summary is at most two sentences describing what the screenshot contains.
- extractedText is a compact excerpt (max 600 characters) of the meaningful visible text, used for search. Do not transcribe decorative or repeated UI chrome.
- confidence reflects how sure you are of BOTH the classification and the extracted fields.
- Set fields you cannot find to null. Never invent an address, price, date or URL that is not visible.
- Preserve the original language of the screenshot in title, subtitle and summary.
- A screenshot that is only a meme or a joke is NON_ACTIONABLE with low confidence and empty fields.`;

/**
 * Response schema handed to Gemini's structured-output mode, so the model
 * returns parseable JSON instead of prose that needs scraping.
 */
export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    classification: {
      type: 'STRING',
      enum: ['ACTIONABLE', 'NON_ACTIONABLE', 'UNCERTAIN'],
    },
    category: {
      type: 'STRING',
      enum: ['EVENT', 'PLACE', 'TASK', 'PRODUCT', 'INFO', 'OTHER'],
    },
    confidence: { type: 'NUMBER' },
    title: { type: 'STRING', nullable: true },
    subtitle: { type: 'STRING', nullable: true },
    summary: { type: 'STRING', nullable: true },
    startsAt: { type: 'STRING', nullable: true },
    endsAt: { type: 'STRING', nullable: true },
    placeName: { type: 'STRING', nullable: true },
    address: { type: 'STRING', nullable: true },
    url: { type: 'STRING', nullable: true },
    price: { type: 'STRING', nullable: true },
    dueAt: { type: 'STRING', nullable: true },
    extractedText: { type: 'STRING', nullable: true },
  },
  required: ['classification', 'category', 'confidence'],
} as const;
