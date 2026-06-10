-- Auto-run on every container startup (idempotent).
-- 1. Drops legacy FK constraints that reference the local users table
--    (Supabase auth UUIDs don't exist in the local users table).
-- 2. Creates newer tables that may not exist in older DB instances.
-- 3. Adds columns that may have been added after the initial DB push.
--
-- All statements are guarded with IF NOT EXISTS / IF EXISTS so this
-- script is always safe to re-run.

-- ── 1. Drop user-id FK constraints ───────────────────────────────────────────
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['trading_sessions', 'trading_sessions_user_id_fkey'],
    ['journal_entries',  'journal_entries_user_id_fkey'],
    ['journal_entries',  'journal_entries_session_id_fkey'],
    ['trades',           'trades_user_id_fkey'],
    ['copy_accounts',    'copy_accounts_user_id_fkey'],
    ['copy_masters',     'copy_masters_user_id_fkey'],
    ['copy_followers',   'copy_followers_user_id_fkey'],
    ['broker_accounts',  'broker_accounts_user_id_fkey']
  ];
  r text[];
BEGIN
  FOREACH r SLICE 1 IN ARRAY pairs LOOP
    IF to_regclass(r[1]) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r[1], r[2]);
      RAISE NOTICE 'Dropped constraint % on % (if existed)', r[2], r[1];
    END IF;
  END LOOP;
END $$;

-- ── 2. broker_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_accounts (
  id              VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR      NOT NULL,
  name            TEXT         NOT NULL,
  login_id        TEXT         NOT NULL,
  password_enc    TEXT,
  server          TEXT,
  platform        TEXT         NOT NULL,
  account_type    TEXT         DEFAULT 'demo',
  connection_type TEXT         DEFAULT 'webhook',
  currency        TEXT         DEFAULT 'USD',
  balance         DECIMAL(14,2),
  equity          DECIMAL(14,2),
  leverage        INTEGER,
  is_active       BOOLEAN      DEFAULT TRUE,
  sync_status     TEXT         DEFAULT 'pending',
  last_sync_at    TIMESTAMP,
  last_sync_error TEXT,
  webhook_token   TEXT,
  default_session_id VARCHAR,
  trade_count     INTEGER      DEFAULT 0,
  created_at      TIMESTAMP    DEFAULT NOW(),
  updated_at      TIMESTAMP    DEFAULT NOW()
);

-- Add columns that may be missing from older instances
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS last_sync_error   TEXT;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS webhook_token      TEXT;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS default_session_id VARCHAR;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS trade_count        INTEGER DEFAULT 0;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS equity             DECIMAL(14,2);
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS leverage           INTEGER;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS connection_type    TEXT DEFAULT 'webhook';
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS currency           TEXT DEFAULT 'USD';
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS server             TEXT;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS password_enc       TEXT;

-- ── 3. synced_trades ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synced_trades (
  id                VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_account_id VARCHAR      NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  user_id           VARCHAR      NOT NULL,
  external_id       TEXT         NOT NULL,
  symbol            TEXT         NOT NULL,
  direction         TEXT         NOT NULL,
  lots              DECIMAL(10,5),
  open_price        DECIMAL(12,5),
  close_price       DECIMAL(12,5),
  stop_loss         DECIMAL(12,5),
  take_profit       DECIMAL(12,5),
  open_time         TIMESTAMP,
  close_time        TIMESTAMP,
  profit_loss       DECIMAL(10,2),
  commission        DECIMAL(8,2),
  swap              DECIMAL(8,2),
  comment           TEXT,
  magic             INTEGER,
  journal_entry_id  VARCHAR,
  journaled_at      TIMESTAMP,
  raw_data          JSONB,
  created_at        TIMESTAMP    DEFAULT NOW()
);

-- ── 4. notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR,
  type         TEXT      NOT NULL,
  title        TEXT      NOT NULL,
  message      TEXT      NOT NULL,
  impact_level TEXT,
  metadata     TEXT,
  is_read      BOOLEAN   DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── 5. telegram_subscribers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id           VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      TEXT      NOT NULL UNIQUE,
  phone_number TEXT,
  username     TEXT,
  first_name   TEXT,
  last_name    TEXT,
  is_active    BOOLEAN   DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── 6. email_tracking ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_tracking (
  id            VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR   NOT NULL,
  campaign_ref  TEXT      NOT NULL,
  token         VARCHAR   NOT NULL UNIQUE,
  opened_at     TIMESTAMP,
  sent_at       TIMESTAMP DEFAULT NOW()
);

-- ── 7. blog_posts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id          VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT      UNIQUE,
  title       TEXT      NOT NULL,
  excerpt     TEXT      DEFAULT '',
  content     TEXT      DEFAULT '',
  category    TEXT      DEFAULT 'Analysis',
  author      TEXT      DEFAULT 'Admin',
  author_id   VARCHAR,
  date        TEXT      NOT NULL,
  read_time   TEXT      DEFAULT '5 min',
  image_url   TEXT      DEFAULT '',
  status      TEXT      DEFAULT 'Draft',
  section     TEXT      DEFAULT 'blog',
  summary     TEXT      DEFAULT '',
  video_url   TEXT      DEFAULT '',
  signal_data JSONB,
  author_data JSONB,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── 8. blog_comments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_comments (
  id         VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    VARCHAR   NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  name       TEXT      NOT NULL,
  message    TEXT      NOT NULL,
  reply      TEXT,
  replied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── 9. page_views ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_views (
  id               VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  page             TEXT      NOT NULL,
  session_id       TEXT,
  duration_seconds INTEGER,
  ip_address       TEXT,
  referrer_source  TEXT,
  page_section     TEXT,
  country          TEXT,
  country_code     TEXT,
  viewed_at        TIMESTAMP DEFAULT NOW()
);

-- ── 10. admin_access_logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_access_logs (
  id           VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR,
  email        TEXT,
  ip           TEXT      NOT NULL,
  country      TEXT,
  country_code TEXT,
  region       TEXT,
  city         TEXT,
  isp          TEXT,
  accessed_at  TIMESTAMP DEFAULT NOW()
);

-- ── 11. price_alerts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_alerts (
  id            VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR      NOT NULL,
  symbol        TEXT         NOT NULL,
  asset_class   TEXT         NOT NULL DEFAULT 'forex',
  target_price  DECIMAL(15,8) NOT NULL,
  direction     TEXT         NOT NULL,
  proximity_pct DECIMAL(5,3) DEFAULT 0,
  is_triggered  BOOLEAN      DEFAULT FALSE,
  triggered_at  TIMESTAMP,
  created_at    TIMESTAMP    DEFAULT NOW()
);

-- ── 12. trading_sessions — add broker_timezone if missing ────────────────────
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS broker_timezone INTEGER DEFAULT 2;

-- ── Done ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'docker-migrate.sql complete'; END $$;
