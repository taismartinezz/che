import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

/**
 * When an OAuth sign-in fails, Supabase comes back with ?error=…&error_description=…
 * (or the same in the #hash). The app then redirects to /login and that URL is lost,
 * so the person saw nothing. Keep it for the login screen before anything navigates.
 */
export const AUTH_ERROR_KEY = 'che-auth-error';
try {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.slice(1));
  const err = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  if (err) sessionStorage.setItem(AUTH_ERROR_KEY, err);
} catch {
  /* ignore */
}

// When env vars are missing the app shows a setup screen and never calls this client.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
