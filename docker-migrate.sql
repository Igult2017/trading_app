-- Auto-run on every container startup.
-- Drops legacy FK constraints that reference the local users table.
-- Supabase auth UUIDs are used as user_id values and do not exist
-- in the local users table, so these constraints must not be present.
--
-- Each statement is guarded by a to_regclass() check so it is safe
-- to run before the app's schema initializer has created the tables.

DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['trading_sessions', 'trading_sessions_user_id_fkey'],
    ['journal_entries',  'journal_entries_user_id_fkey'],
    ['journal_entries',  'journal_entries_session_id_fkey'],
    ['trades',           'trades_user_id_fkey'],
    ['copy_accounts',    'copy_accounts_user_id_fkey'],
    ['copy_masters',     'copy_masters_user_id_fkey'],
    ['copy_followers',   'copy_followers_user_id_fkey']
  ];
  r text[];
BEGIN
  FOREACH r SLICE 1 IN ARRAY pairs LOOP
    RAISE NOTICE 'Checking % for constraint %', r[1], r[2];
    IF to_regclass(r[1]) IS NOT NULL THEN
      RAISE NOTICE 'Dropping constraint % on %', r[2], r[1];
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r[1], r[2]);
    ELSE
      RAISE NOTICE 'Skipping %, table does not exist yet', r[1];
    END IF;
  END LOOP;
END $$;
