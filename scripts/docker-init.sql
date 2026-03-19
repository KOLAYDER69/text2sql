-- Docker auto-init: all app tables for text2SQL
-- This runs automatically on first docker compose up

-- ==========================================
-- Core tables
-- ==========================================

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'user',
  password_hash TEXT,
  invited_by INTEGER REFERENCES app_users(id),
  is_vip BOOLEAN DEFAULT false,
  can_query BOOLEAN DEFAULT true,
  can_invite BOOLEAN DEFAULT false,
  can_train BOOLEAN DEFAULT false,
  can_schedule BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_invites (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER REFERENCES app_users(id),
  used_by INTEGER REFERENCES app_users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_query_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app_users(id),
  platform TEXT DEFAULT 'web',
  question TEXT NOT NULL,
  sql TEXT,
  row_count INTEGER DEFAULT 0,
  execution_ms INTEGER DEFAULT 0,
  error TEXT,
  rows_json JSONB,
  fields TEXT[],
  analysis TEXT,
  chart_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_schedules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app_users(id),
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- Auth & sharing
-- ==========================================

CREATE TABLE IF NOT EXISTS app_auth_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES app_users(id),
  authenticated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_shared_queries (
  id SERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES app_users(id),
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  rows_json JSONB,
  fields TEXT[],
  row_count INTEGER DEFAULT 0,
  analysis TEXT,
  chart_config JSONB,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_query_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app_users(id),
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- Suggestions & descriptions
-- ==========================================

CREATE TABLE IF NOT EXISTS app_suggestions (
  id SERIAL PRIMARY KEY,
  suggestions JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_schema_descriptions (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  column_name TEXT,
  description TEXT NOT NULL,
  updated_by INTEGER REFERENCES app_users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_desc_col
  ON app_schema_descriptions (table_name, column_name)
  WHERE column_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_desc_table
  ON app_schema_descriptions (table_name)
  WHERE column_name IS NULL;

-- ==========================================
-- Chat & features
-- ==========================================

CREATE TABLE IF NOT EXISTS app_chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app_users(id),
  message TEXT NOT NULL,
  share_preview JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_feature_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app_users(id),
  page TEXT,
  x REAL,
  y REAL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  admin_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- Dashboard
-- ==========================================

CREATE TABLE IF NOT EXISTS app_dashboard_plans (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  planned_replenishments NUMERIC DEFAULT 0,
  planned_revenue NUMERIC DEFAULT 0,
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS app_dashboard_tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT,
  due_date DATE,
  status TEXT DEFAULT 'planned',
  blocker TEXT,
  new_due_date DATE,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_dashboard_notes (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  section TEXT NOT NULL,
  content TEXT DEFAULT '',
  UNIQUE (week_start, section)
);

-- ==========================================
-- Docker config storage
-- ==========================================

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- Indexes
-- ==========================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram ON app_users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_history_user ON app_query_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON app_query_history(created_at DESC);

-- ==========================================
-- Default admin (Docker mode — login: admin / admin)
-- Change password after first login!
-- ==========================================

INSERT INTO app_users (telegram_id, username, first_name, role, password_hash, can_query, can_invite, can_train, can_schedule)
VALUES (0, 'admin', 'Admin', 'admin', 'admin', true, true, true, true)
ON CONFLICT DO NOTHING;
