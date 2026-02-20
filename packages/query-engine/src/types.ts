export type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

export type TableSchema = {
  name: string;
  columns: ColumnInfo[];
};

export type SchemaInfo = {
  tables: TableSchema[];
  cachedAt: number;
};

export type QueryResult = {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionMs: number;
};

export type QueryResponse = {
  question: string;
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionMs: number;
  error?: string;
  analysis?: string;
};
