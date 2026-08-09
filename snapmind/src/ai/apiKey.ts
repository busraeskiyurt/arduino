import * as SecureStore from 'expo-secure-store';

/**
 * The Gemini key lives in the device keychain/keystore, never in AsyncStorage
 * and never in the database. `EXPO_PUBLIC_GEMINI_API_KEY` is honoured as a
 * development convenience only — values inlined at build time are readable in
 * the shipped bundle, so a real build should rely on the stored key.
 */
const KEY = 'snapmind.gemini_api_key';

let cached: string | null | undefined;

export async function getGeminiApiKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(KEY);
  } catch {
    stored = null;
  }
  const resolved = stored ?? process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? null;
  cached = resolved;
  return resolved;
}

export async function setGeminiApiKey(value: string | null): Promise<void> {
  cached = undefined;
  if (value && value.trim().length > 0) {
    await SecureStore.setItemAsync(KEY, value.trim());
  } else {
    await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  }
}

export async function hasGeminiApiKey(): Promise<boolean> {
  return (await getGeminiApiKey()) !== null;
}
