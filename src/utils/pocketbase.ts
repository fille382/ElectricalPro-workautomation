/**
 * PocketBase client module — lazy-loaded singleton
 * Only initializes when a PocketBase URL is configured in settings.
 * The app works fully without PocketBase (pure offline mode).
 */

import PocketBase from 'pocketbase';
import { getSettings, saveSettings } from './db';

let pbInstance: PocketBase | null = null;
let pbUrl: string | null = null;

// Health check cache
let lastHealthCheck = 0;
let lastHealthResult = false;
const HEALTH_CHECK_TTL = 30_000; // 30 seconds

/**
 * Get or create PocketBase singleton from stored URL.
 * Returns null if no URL configured.
 */
export async function getPB(): Promise<PocketBase | null> {
  const settings = await getSettings();
  const url = settings.pocketbase_url;

  if (!url) return null;

  // Recreate if URL changed
  if (pbInstance && pbUrl !== url) {
    pbInstance = null;
    pbUrl = null;
  }

  if (!pbInstance) {
    pbInstance = new PocketBase(url);
    pbUrl = url;

    // Restore auth token if we have one
    if (settings.pb_auth_token) {
      try {
        pbInstance.authStore.save(settings.pb_auth_token, null);
        // Validate the token
        await pbInstance.collection('users').authRefresh();
      } catch {
        // Token expired or invalid, clear it
        pbInstance.authStore.clear();
        await saveSettings({ pb_auth_token: undefined, pb_user_id: undefined, pb_user_email: undefined, pb_user_name: undefined });
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
 * Authenticate with Google OAuth via PocketBase.
 * Uses redirect mode for mobile compatibility.
 */
export async function authWithGoogle(): Promise<{ id: string; email: string; name: string } | null> {
  const pb = await getPB();
  if (!pb) throw new Error('PocketBase not configured');

  try {
    const authData = await pb.collection('users').authWithOAuth2({ provider: 'google' });
    const user = authData.record;

    // Save auth info to settings
    await saveSettings({
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
  await saveSettings({
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
 * Check if PocketBase is configured (URL saved in settings).
 */
export async function isPBConfigured(): Promise<boolean> {
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
