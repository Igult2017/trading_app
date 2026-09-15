import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createTokenMemory } from './tokenMemory';

const supabaseUrl    = process.env.VITE_SUPABASE_URL       ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const hasCredentials = Boolean(supabaseUrl && serviceRoleKey);

if (!hasCredentials) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — auth endpoints will not work');
}

/**
 * Server-side Supabase client using the service role key.
 * Will be null when credentials are not configured.
 * This has full admin access; never expose this to the browser.
 */
export const supabaseAdmin: SupabaseClient | null = hasCredentials
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const confirmedTokens = createTokenMemory<User>();

/**
 * Verify a JWT from the Authorization header and return the user,
 * or null if the token is invalid / missing.
 */
export async function verifyToken(authHeader: string | undefined) {
  if (!supabaseAdmin) return null;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  // A token Supabase confirmed moments ago is not asked about again (tokenMemory.ts: at most 30s,
  // never past its own expiry). This call cost +0.23-0.27s on EVERY signed-in request.
  const known = confirmedTokens.get(token);
  if (known) return known;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;   // refused: never remembered
  confirmedTokens.remember(token, data.user);
  return data.user;
}
