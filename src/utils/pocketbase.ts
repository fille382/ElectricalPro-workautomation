/**
 * PocketBase client module — lazy-loaded singleton
 *
 * URL priority:
 * 1. VITE_POCKETBASE_URL env var (baked in at build time — for production)
 * 2. Settings (user-configured — for development/testing)
 *
 * In production, users never see a URL field — just "Login with Google".
 */

import PocketBase from 'pocketbase';
import { getSettings, saveSettings } from './db';

let pbInstance: PocketBase | null = null;
let pbUrl: string | null = null;

// URL from environment variable (set at build time)
const ENV_PB_URL = import.meta.env.VITE_POCKETBASE_URL as string | undefined;

// Health check cache
let lastHealthCheck = 0;
let lastHealthResult = false;
const HEALTH_CHECK_TTL = 30_000; // 30 seconds

/**
 * Get the configured PocketBase URL.
 * Env var takes priority over settings.
 */
export async function getPBUrl(): Promise<string | null> {
  // If env var is set, use it. If empty string, use same origin (served from PocketBase)
  if (ENV_PB_URL !== undefined && ENV_PB_URL !== '') return ENV_PB_URL;
  if (ENV_PB_URL === '') return window.location.origin;
  const settings = await getSettings();
  return settings.pocketbase_url || null;
}

/**
 * Check if PocketBase URL comes from env (not user-configurable).
 */
export function isEnvConfigured(): boolean {
  return ENV_PB_URL !== undefined;
}

/**
 * Get or create PocketBase singleton.
 * Returns null if no URL configured.
 */
export async function getPB(): Promise<PocketBase | null> {
  const url = await getPBUrl();

  if (!url) return null;

  // Recreate if URL changed
  if (pbInstance && pbUrl !== url) {
    pbInstance = null;
    pbUrl = null;
  }

  if (!pbInstance) {
    pbInstance = new PocketBase(url);
    pbInstance.autoCancellation(false);
    // Add ngrok header to skip browser warning page
    pbInstance.beforeSend = function (url, options) {
      options.headers = options.headers || {};
      (options.headers as Record<string, string>)['ngrok-skip-browser-warning'] = 'true';
      return { url, options };
    };
    pbUrl = url;

    // Restore auth token if we have one
    const settings = await getSettings();
    if (settings.pb_auth_token) {
      try {
        pbInstance.authStore.save(settings.pb_auth_token, null);
        // Validate the token
        await pbInstance.collection('users').authRefresh();
      } catch {
        // Token expired or invalid, clear it
        pbInstance.authStore.clear();
        await saveSettings({ ...settings, pb_auth_token: undefined, pb_user_id: undefined, pb_user_email: undefined, pb_user_name: undefined });
      }
    }
  }

  return pbInstance;
}

/**
 * Get PocketBase instance synchronously (for use after initial setup).
 * Returns null if not yet initialized.
 */
export function getPBSync(): PocketBase | null {
  return pbInstance;
}

/**
 * Check if PocketBase is reachable (cached for 30s).
 */
export async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_TTL) {
    return lastHealthResult;
  }

  const pb = await getPB();
  if (!pb) return false;

  try {
    await pb.health.check();
    lastHealthResult = true;
  } catch {
    lastHealthResult = false;
  }
  lastHealthCheck = now;
  return lastHealthResult;
}

/**
 * Authenticate with Google OAuth via manual popup + localStorage + REST.
 *
 * Flow:
 * 1. Get auth methods from PocketBase (REST, works with ngrok header)
 * Full-page redirect flow:
 * 1. Save provider state to localStorage
 * 2. Redirect to Google login (full page, no popup)
 * 3. Google redirects back to our oauth-callback.html
 * 4. Callback page stores code in localStorage and redirects to app
 * 5. App detects code in localStorage and exchanges for auth token
 */
export async function authWithGoogle(): Promise<{ id: string; email: string; name: string } | null> {
  console.log('[PB] authWithGoogle() called');
  const pb = await getPB();
  console.log('[PB] getPB() returned:', pb ? 'PocketBase instance' : 'null');
  if (!pb) throw new Error('PocketBase not configured');

  try {
    console.log('[PB] Fetching auth methods...');
    const authMethods = await pb.collection('users').listAuthMethods();
    console.log('[PB] Auth methods:', JSON.stringify(authMethods.oauth2?.providers?.map((p: any) => p.name)));
    const google = authMethods.oauth2?.providers?.find((p: any) => p.name === 'google');
    if (!google) throw new Error('Google provider inte konfigurerad');

    const redirectUrl = window.location.origin + (import.meta.env.BASE_URL || '/') + 'oauth-callback.html';
    console.log('[PB] Redirect URL:', redirectUrl);
    console.log('[PB] Google authURL:', google.authURL?.substring(0, 80) + '...');

    // Save state for when we return from Google
    localStorage.setItem('pb_oauth_pending', JSON.stringify({
      codeVerifier: google.codeVerifier,
      state: google.state,
      redirectUrl,
    }));

    // Full-page redirect to Google — no popup!
    const authUrl = google.authURL + encodeURIComponent(redirectUrl);
    console.log('[PB] Redirecting to:', authUrl.substring(0, 100) + '...');
    window.location.href = authUrl;

    // Won't reach here
    return null;
  } catch (err) {
    console.error('[PB] Google auth start failed:', err);
    return null;
  }
}

/**
 * Complete OAuth2 login after returning from Google redirect.
 * Called on app startup if localStorage has pending OAuth data.
 */
export async function completeOAuthIfPending(): Promise<{ id: string; email: string; name: string } | null> {
  const resultStr = localStorage.getItem('pb_oauth_result');
  const pendingStr = localStorage.getItem('pb_oauth_pending');

  if (!resultStr || !pendingStr) return null;

  const result = JSON.parse(resultStr);
  const pending = JSON.parse(pendingStr);

  // Clean up
  localStorage.removeItem('pb_oauth_result');
  localStorage.removeItem('pb_oauth_pending');

  if (!result.code || !pending.codeVerifier) return null;

  const pb = await getPB();
  if (!pb) return null;

  try {
    const authData = await pb.collection('users').authWithOAuth2Code(
      'google',
      result.code,
      pending.codeVerifier,
      pending.redirectUrl,
    );
    const user = authData.record;

    const currentSettings = await getSettings();
    await saveSettings({
      ...currentSettings,
      pb_auth_token: pb.authStore.token,
      pb_user_id: user.id,
      pb_user_email: user.email,
      pb_user_name: user.name || user.email,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name || user.email,
    };
  } catch (err) {
    console.error('[PB] OAuth code exchange failed:', err);
    return null;
  }
}

/**
 * Log out and clear stored auth.
 */
export async function logout(): Promise<void> {
  if (pbInstance) {
    pbInstance.authStore.clear();
  }
  const currentSettings = await getSettings();
  await saveSettings({
    ...currentSettings,
    pb_auth_token: undefined,
    pb_user_id: undefined,
    pb_user_email: undefined,
    pb_user_name: undefined,
  });
}

/**
 * Get current authenticated user info, or null.
 */
export async function getAuthUser(): Promise<{ id: string; email: string; name: string } | null> {
  const settings = await getSettings();
  if (!settings.pb_user_id) return null;

  return {
    id: settings.pb_user_id,
    email: settings.pb_user_email || '',
    name: settings.pb_user_name || settings.pb_user_email || '',
  };
}

/**
 * Test connection to a PocketBase URL.
 * Returns true if reachable and healthy.
 */
export async function testConnection(url: string): Promise<boolean> {
  try {
    const pb = new PocketBase(url);
    await pb.health.check();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if PocketBase is configured (env var or settings).
 */
export async function isPBConfigured(): Promise<boolean> {
  if (ENV_PB_URL) return true;
  const settings = await getSettings();
  return !!settings.pocketbase_url;
}

/**
 * Check if user is authenticated with PocketBase.
 */
export async function isAuthenticated(): Promise<boolean> {
  const pb = await getPB();
  return pb?.authStore?.isValid ?? false;
}
