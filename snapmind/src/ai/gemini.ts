import { CONFIG } from '@/config';
import { getGeminiApiKey } from './apiKey';
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, type ScreenshotAnalysis } from './schema';

/**
 * Gemini multimodal analysis.
 *
 * The REST endpoint is called directly with `fetch` — no SDK — because that
 * keeps the React Native bundle free of Node-only dependencies and makes the
 * exact request payload (which is the privacy-sensitive part) obvious.
 *
 * Only screenshots that survived local pre-filtering reach this function.
 */

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Gemini API key configured.');
    this.name = 'MissingApiKeyError';
  }
}

export async function analyzeScreenshot(image: {
  base64: string;
  mimeType: string;
}): Promise<ScreenshotAnalysis> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const url = `${CONFIG.geminiEndpoint}/${CONFIG.geminiModel}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            { text: 'Analyze this screenshot.' },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // 429 and 5xx are transient; 4xx generally means the request itself is bad.
    const retryable = response.status === 429 || response.status >= 500;
    throw new GeminiError(
      `Gemini request failed (${response.status}): ${body.slice(0, 300)}`,
      response.status,
      retryable,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const blockReason = payload.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiError(`Blocked by safety filter: ${blockReason}`, null, false);
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new GeminiError('Gemini returned an empty response.', null, true);
  }

  return parseAnalysis(text);
}

function parseAnalysis(text: string): ScreenshotAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Structured output makes this rare, but a stray code fence is cheap to
    // recover from rather than burning a retry.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new GeminiError('Gemini response was not JSON.', null, true);
    }
    parsed = JSON.parse(match[0]);
  }
  return normalizeAnalysis(parsed);
}

const CLASSIFICATIONS = ['ACTIONABLE', 'NON_ACTIONABLE', 'UNCERTAIN'] as const;
const CATEGORIES = ['EVENT', 'PLACE', 'TASK', 'PRODUCT', 'INFO', 'OTHER'] as const;

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'null' ? trimmed : null;
}

/** Defensive normalization — the model is guided, not trusted. */
export function normalizeAnalysis(raw: unknown): ScreenshotAnalysis {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const classification = CLASSIFICATIONS.includes(obj.classification as never)
    ? (obj.classification as ScreenshotAnalysis['classification'])
    : 'UNCERTAIN';

  const category = CATEGORIES.includes(obj.category as never)
    ? (obj.category as ScreenshotAnalysis['category'])
    : 'OTHER';

  const confidenceRaw = Number(obj.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;

  return {
    classification,
    category,
    confidence,
    title: str(obj.title),
    subtitle: str(obj.subtitle),
    summary: str(obj.summary),
    startsAt: str(obj.startsAt),
    endsAt: str(obj.endsAt),
    placeName: str(obj.placeName),
    address: str(obj.address),
    url: str(obj.url),
    price: str(obj.price),
    dueAt: str(obj.dueAt),
    extractedText: str(obj.extractedText),
  };
}
