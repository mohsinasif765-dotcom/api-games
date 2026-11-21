import type { SupabaseClient } from '@supabase/supabase-js';

let client: Promise<SupabaseClient> | null = null;

/**
 * Supabase client, loaded on first use.
 *
 * Game shells authenticate through the API gateway (API key); Supabase is
 * only the legacy/WebView-token path. Importing it lazily keeps ~60 KB (gzip)
 * of supabase-js off the cold-start critical path.
 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= import('./supabase').then((m) => m.supabase);
  return client;
}
