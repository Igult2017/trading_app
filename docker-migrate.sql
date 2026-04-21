-- Auto-run on every container startup.
-- Drops legacy FK constraints that reference the local users table.
-- Supabase auth UUIDs are used as user_id values and do not exist
-- in the local users table, so these constraints must not be present.

ALTER TABLE trading_sessions DROP CONSTRAINT IF EXISTS trading_sessions_user_id_fkey;
ALTER TABLE journal_entries  DROP CONSTRAINT IF EXISTS journal_entries_user_id_fkey;
ALTER TABLE journal_entries  DROP CONSTRAINT IF EXISTS journal_entries_session_id_fkey;
ALTER TABLE trades           DROP CONSTRAINT IF EXISTS trades_user_id_fkey;
ALTER TABLE copy_accounts    DROP CONSTRAINT IF EXISTS copy_accounts_user_id_fkey;
ALTER TABLE copy_masters     DROP CONSTRAINT IF EXISTS copy_masters_user_id_fkey;
ALTER TABLE copy_followers   DROP CONSTRAINT IF EXISTS copy_followers_user_id_fkey;
