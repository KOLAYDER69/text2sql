-- Schema descriptions for training AI on business context
CREATE TABLE IF NOT EXISTS app_schema_descriptions (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  column_name TEXT,
  description TEXT NOT NULL,
  updated_by INT REFERENCES app_users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index for table+column descriptions (column IS NOT NULL)
CREATE UNIQUE INDEX idx_schema_desc_table_col
  ON app_schema_descriptions (table_name, column_name) WHERE column_name IS NOT NULL;

-- Unique index for table-level descriptions (column IS NULL)
CREATE UNIQUE INDEX idx_schema_desc_table_only
  ON app_schema_descriptions (table_name) WHERE column_name IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_schema_descriptions TO querybot_app;
GRANT USAGE, SELECT ON app_schema_descriptions_id_seq TO querybot_app;
