import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

/**
 * Minimal Google OAuth, used by one feature only: creating real Google Tasks.
 *
 * Calendar and Maps work through public URL templates and need no sign-in, so
 * this stays optional. If no client ID is configured the app simply falls back
 * to opening Google Tasks in the browser — there is no auth requirement baked
 * into the core flow.
 */

const TOKEN_KEY = 'snapmind.google_token';
const SCOPES = ['https://www.googleapis.com/auth/tasks'];

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

function clientId(): string | null {
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? null;
}

export function isGoogleAuthConfigured(): boolean {
  return clientId() !== null;
}

async function readToken(): Promise<StoredToken | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

async function writeToken(token: StoredToken | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(token));
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }
}

export async function signOutGoogle(): Promise<void> {
  await writeToken(null);
}

export async function isGoogleSignedIn(): Promise<boolean> {
  return (await readToken()) !== null;
}

/**
 * Returns a usable access token, refreshing or prompting as needed.
 *
 * @returns `null` when Google auth is not configured or the user cancelled.
 */
export async function getGoogleAccessToken(
  options: { interactive?: boolean } = {},
): Promise<string | null> {
  const id = clientId();
  if (!id) return null;

  const stored = await readToken();
  if (stored && stored.expiresAt > Date.now() + 60_000) {
    return stored.accessToken;
  }

  if (stored?.refreshToken) {
    try {
      const refreshed = await AuthSession.refreshAsync(
        { clientId: id, refreshToken: stored.refreshToken },
        DISCOVERY,
      );
      const token = toStoredToken(refreshed, stored.refreshToken);
      await writeToken(token);
      return token.accessToken;
    } catch {
      await writeToken(null);
    }
  }

  if (options.interactive === false) return null;

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'snapmind' });
  const request = new AuthSession.AuthRequest({
    clientId: id,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) return null;

  const exchanged = await AuthSession.exchangeCodeAsync(
    {
      clientId: id,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    DISCOVERY,
  );

  const token = toStoredToken(exchanged);
  await writeToken(token);
  return token.accessToken;
}

function toStoredToken(
  response: AuthSession.TokenResponse,
  fallbackRefresh?: string,
): StoredToken {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? fallbackRefresh,
    expiresAt: Date.now() + (response.expiresIn ?? 3600) * 1000,
  };
}
