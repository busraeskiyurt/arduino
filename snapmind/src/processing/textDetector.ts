/**
 * Optional on-device text detection.
 *
 * Expo Go ships no OCR engine, so the default implementation returns `null`
 * ("unknown"), and the pipeline treats that as "cannot classify locally →
 * let Gemini decide". Dropping in a native OCR module (Apple Vision via
 * `VNRecognizeTextRequest`, or ML Kit Text Recognition on Android) only means
 * registering it here — the prioritizer and pre-filter pick it up
 * automatically and start scoring screenshots on their real text.
 */
export interface TextDetector {
  /**
   * @returns recognized text, or `null` when the detector cannot answer.
   *          An empty string means "ran, and found no text".
   */
  detect(localUri: string): Promise<string | null>;
}

let detector: TextDetector | null = null;

export function registerTextDetector(impl: TextDetector | null): void {
  detector = impl;
}

export function hasTextDetector(): boolean {
  return detector !== null;
}

export async function detectText(localUri: string): Promise<string | null> {
  if (!detector) return null;
  try {
    return await detector.detect(localUri);
  } catch {
    return null;
  }
}
