-- Migration 003: Add permission flags and VIP to app_users
-- Run against Supabase app DB

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_query BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_invite BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_train BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_schedule BOOLEAN NOT NULL DEFAULT true;
