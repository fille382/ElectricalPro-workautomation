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
    // Disable realtime SSE - tunnels don't support long-lived EventSource connections
    try {
      (pbInstance.realtime as any).disconnect();
    } catch {}
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
 * Authenticate with Google OAuth via manual popup + code exchange.
 * PocketBase SDK's built-in authWithOAuth2 requires realtime/SSE which
 * doesn't work through tunnels (ngrok/cloudflare). This implementation
 * uses a popup that redirects to PocketBase's oauth2-redirect page,
 * which then posts the code back via a callback page we host.
 */
export async function authWithGoogle(): Promise<{ id: string; email: string; name: string } | null> {
  const pb = await getPB();
  if (!pb) throw new Error('PocketBase not configured');

  try {
    // Step 1: Get auth methods to get Google provider config
    const authMethods = await pb.collection('users').listAuthMethods();
    const google = authMethods.oauth2?.providers?.find((p: any) => p.name === 'google');
    if (!google) throw new Error('Missing or invalid provider "google"');

    // Step 2: Use PocketBase's built-in oauth2-redirect endpoint
    // This is already registered in Google Console
    const redirectUrl = pb.buildURL('/api/oauth2-redirect');
    const authUrl = google.authURL + encodeURIComponent(redirectUrl);

    // Step 3: Open popup
    const popup = window.open(authUrl, 'oauth2-popup', 'width=600,height=700,scrollbars=yes,resizable=yes');
    if (!popup) throw new Error('Popup blockerad. Tillåt popups för denna sida.');

    // Step 4: Listen for the OAuth2 callback via localStorage polling
    // PocketBase's /api/oauth2-redirect page stores the result in the URL fragment
    // We poll the popup's URL to catch when it redirects back
    const result = await new Promise<{ code: string; state: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('OAuth2 login tog för lång tid'));
      }, 120000);

      // Listen for message from oauth-callback.html
      function onMessage(event: MessageEvent) {
        if (event.data?.type === 'oauth2-callback' && event.data?.code) {
          cleanup();
          resolve({ code: event.data.code, state: event.data.state });
        }
      }
      window.addEventListener('message', onMessage);

      // Check if popup was closed manually (not by our callback)
      // COOP policy blocks popup.closed on cross-origin pages (Google login)
      // so we wrap in try/catch and only reject if we can confirm it's closed
      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            cleanup();
            reject(new Error('OAuth2-fönstret stängdes'));
          }
        } catch {
          // COOP blocks access — popup is still on Google's page, ignore
        }
      }, 1000);

      function cleanup() {
        clearTimeout(timeout);
        clearInterval(interval);
        window.removeEventListener('message', onMessage);
        try { popup?.close(); } catch {}
      }
    });

    // Step 5: Exchange code for auth token
    const authData = await pb.collection('users').authWithOAuth2Code(
      'google',
      result.code,
      google.codeVerifier,
      redirectUrl,
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
