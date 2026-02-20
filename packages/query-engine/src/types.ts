export type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  enum_values?: string[];
};

export type TableSchema = {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
};

export type InferredRelation = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type SchemaInfo = {
  tables: TableSchema[];
  relations: InferredRelation[];
  cachedAt: number;
};

export type QueryResult = {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionMs: number;
};

export type ChartDataset = {
  label: string;
  data: number[];
};

export type ChartConfig = {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: ChartDataset[];
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
  chart?: ChartConfig;
};
