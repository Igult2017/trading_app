import { createClient } from '@supabase/supabase-js';

const supabaseUrl      = process.env.VITE_SUPABASE_URL      ?? '';
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — auth endpoints will not work');
}

/**
 * Server-side Supabase client using the service role key.
 * This has full admin access; never expose this to the browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verify a JWT from the Authorization header and return the user,
 * or null if the token is invalid / missing.
 */
export async function verifyToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
