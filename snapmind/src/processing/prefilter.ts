import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

import { CONFIG } from '@/config';
import { detectText } from './textDetector';
import { scorePriority } from './prioritizer';

/**
 * Local pre-processing — the cheap pass that runs before any network call.
 *
 * It answers three questions without touching the API:
 *   1. Is this screenshot a byte-identical duplicate of one we already know?
 *      (probe hash)
 *   2. Does it carry essentially no information at all? (compressed size)
 *   3. How urgent is it relative to everything else in the queue? (priority)
 *
 * It is not trying to understand the screenshot. When it cannot decide, the
 * screenshot goes to Gemini — a wasted call is cheaper than a lost result.
 */

export interface ProbeResult {
  /** SHA-256 of the normalized 64px probe; equal hashes ⇒ identical images. */
  hash: string | null;
  /** Base64 length of the probe, used as an information-density proxy. */
  size: number | null;
  /** Locally recognized text, when an OCR module is registered. */
  localText: string | null;
  priority: number;
  /** Set when the screenshot should be skipped without an API call. */
  skipReason: string | null;
}

export interface ProbeInput {
  localUri: string;
  creationTime: number | null;
  width: number | null;
  height: number | null;
}

export async function probeScreenshot(input: ProbeInput): Promise<ProbeResult> {
  let hash: string | null = null;
  let size: number | null = null;

  try {
    const probe = await ImageManipulator.manipulateAsync(
      input.localUri,
      [{ resize: { width: CONFIG.probeWidth } }],
      {
        compress: CONFIG.probeQuality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (probe.base64) {
      size = probe.base64.length;
      // Same source pixels + same downscale settings ⇒ same bytes ⇒ same hash.
      hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        probe.base64,
      );
    }
  } catch {
    // A probe failure is not fatal — fall through with unknowns and let the
    // screenshot be analyzed normally.
  }

  const localText = await detectText(input.localUri);

  const priority = scorePriority({
    creationTime: input.creationTime,
    probeSize: size,
    localText,
    width: input.width,
    height: input.height,
  });

  return {
    hash,
    size,
    localText,
    priority,
    skipReason: decideSkip(size, localText),
  };
}

/**
 * Only two things are skipped outright: an image that compresses down to
 * almost nothing (a solid colour, a blank page), and one where a local OCR
 * engine positively confirmed there is no text. Everything else is analyzed.
 */
function decideSkip(size: number | null, localText: string | null): string | null {
  if (size !== null && size < CONFIG.lowInformationBase64Threshold) {
    return 'low_information';
  }
  if (localText !== null && localText.trim().length === 0) {
    return 'no_text_detected';
  }
  return null;
}

/** Produces the downscaled JPEG that is actually uploaded for analysis. */
export async function buildUploadImage(
  localUri: string,
  width: number | null,
  height: number | null,
): Promise<{ base64: string; mimeType: string } | null> {
  const longestEdge = Math.max(width ?? 0, height ?? 0);
  const actions: ImageManipulator.Action[] =
    longestEdge > CONFIG.uploadMaxEdge || longestEdge === 0
      ? [
          (height ?? 0) >= (width ?? 0)
            ? { resize: { height: CONFIG.uploadMaxEdge } }
            : { resize: { width: CONFIG.uploadMaxEdge } },
        ]
      : [];

  const output = await ImageManipulator.manipulateAsync(localUri, actions, {
    compress: CONFIG.uploadQuality,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!output.base64) return null;
  return { base64: output.base64, mimeType: 'image/jpeg' };
}
