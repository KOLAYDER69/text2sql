-- Dashboard: monthly plans + weekly tasks
-- Run against APP database (Supabase)

-- Monthly plan targets
CREATE TABLE IF NOT EXISTS app_dashboard_plans (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  planned_replenishments INT NOT NULL DEFAULT 0,
  planned_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year, month)
);

-- Weekly tasks with status tracking
CREATE TABLE IF NOT EXISTS app_dashboard_tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'blocked')),
  blocker TEXT,
  new_due_date DATE,
  week_start DATE NOT NULL, -- Monday of the week
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly metric snapshots (for historical comparison when live queries unavailable)
CREATE TABLE IF NOT EXISTS app_dashboard_notes (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('problems', 'insights')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_start, section)
);
