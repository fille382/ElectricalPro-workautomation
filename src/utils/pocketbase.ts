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
    // Disable realtime SSE auto-connect (ngrok free returns HTML for SSE)
    // Our OAuth flow uses localStorage polling instead, so SSE is not needed
    (pbInstance.realtime as any).connect = async () => {};
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
 * 2. Open popup to Google login
 * 3. Google redirects to our oauth-callback.html on GitHub Pages
 * 4. Callback page stores code in localStorage
 * 5. We poll localStorage for the result (no SSE, no COOP issues)
 * 6. Exchange code for auth token via REST API
 */
export async function authWithGoogle(): Promise<{ id: string; email: string; name: string } | null> {
  const pb = await getPB();
  if (!pb) throw new Error('PocketBase not configured');

  try {
    // Step 1: Get Google provider config
    const authMethods = await pb.collection('users').listAuthMethods();
    const google = authMethods.oauth2?.providers?.find((p: any) => p.name === 'google');
    if (!google) throw new Error('Google provider inte konfigurerad');

    // Step 2: Build redirect URL to our callback page (same origin as app)
    const redirectUrl = window.location.origin + (import.meta.env.BASE_URL || '/') + 'oauth-callback.html';
    const authUrl = google.authURL + encodeURIComponent(redirectUrl);

    // Clear any previous result
    localStorage.removeItem('pb_oauth_result');

    // Step 3: Open popup
    const popup = window.open(authUrl, 'oauth2-popup', 'width=600,height=700,scrollbars=yes,resizable=yes');
    if (!popup) throw new Error('Popup blockerad. Tillåt popups för denna sida.');

    // Step 4: Poll localStorage for result (no SSE, no COOP needed)
    const result = await new Promise<{ code: string; state: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Inloggning tog för lång tid'));
      }, 120000);

      const interval = setInterval(() => {
        // Check localStorage for result from callback page
        const stored = localStorage.getItem('pb_oauth_result');
        if (stored) {
          localStorage.removeItem('pb_oauth_result');
          cleanup();
          try { popup.close(); } catch {}
          resolve(JSON.parse(stored));
          return;
        }
      }, 500);

      function cleanup() {
        clearTimeout(timeout);
        clearInterval(interval);
      }
    });

    // Step 5: Exchange code for auth token via REST (no SSE needed)
    const authData = await pb.collection('users').authWithOAuth2Code(
      'google',
      result.code,
      google.codeVerifier,
      redirectUrl,
    );
    const user = authData.record;

    // Step 6: Save auth info
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
    console.error('[PB] Google auth failed:', err);
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
