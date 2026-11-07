import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Apply the mobile WebView access token without using (or rotating) the
 * app's refresh token. Sharing refresh tokens between Flutter + games was
 * signing users out of the main app.
 */
export async function applyWebViewAccessToken(
  accessToken: string | null | undefined,
): Promise<User | null> {
  const token = accessToken?.trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: token,
    // Placeholder only — never pass the mobile refresh token here.
    refresh_token: 'webview-no-refresh',
  });

  try {
    supabase.auth.stopAutoRefresh();
  } catch {
    // Older clients may not expose stopAutoRefresh.
  }

  if (error) {
    console.error('[webview-auth] setSession failed:', error.message);
    return null;
  }

  return data.user ?? null;
}
