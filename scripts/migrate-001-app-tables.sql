-- Migration 001: App tables for auth, invites, history, schedules
-- Run against the database as superuser/owner

-- Create app role with write access
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'querybot_app') THEN
    CREATE ROLE querybot_app WITH LOGIN PASSWORD '9048295cb7aa8c6c4305f0fb7725968962a1c4e0599a90da';
  END IF;
END
$$;

-- Tables

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  invited_by INT REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_invites (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by INT NOT NULL REFERENCES app_users(id),
  used_by INT REFERENCES app_users(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_query_history (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_users(id),
  platform TEXT NOT NULL CHECK (platform IN ('web', 'telegram')),
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  row_count INT,
  execution_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_schedules (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_users(id),
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_app_users_telegram_id ON app_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_invites_code ON app_invites(code);
CREATE INDEX IF NOT EXISTS idx_app_query_history_user_id ON app_query_history(user_id);
CREATE INDEX IF NOT EXISTS idx_app_query_history_created_at ON app_query_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_schedules_user_id ON app_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_app_schedules_active ON app_schedules(is_active) WHERE is_active = true;

-- Grant app role access to app_ tables
GRANT USAGE ON SCHEMA public TO querybot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_users, app_invites, app_query_history, app_schedules TO querybot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO querybot_app;

-- Also grant readonly on business tables so app role can introspect
GRANT SELECT ON ALL TABLES IN SCHEMA public TO querybot_app;

-- Seed initial admin user
INSERT INTO app_users (telegram_id, first_name, role)
VALUES (6134695031, 'Admin', 'admin')
ON CONFLICT (telegram_id) DO NOTHING;
