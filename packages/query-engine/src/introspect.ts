import type { Pool } from "pg";
import type { ColumnInfo, SchemaInfo, TableSchema } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: SchemaInfo | null = null;

export async function getSchema(pool: Pool): Promise<TableSchema[]> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tables;
  }

  const { rows } = await pool.query<ColumnInfo>(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT LIKE 'pg\_%' ESCAPE '\'
    ORDER BY table_name, ordinal_position
  `);

  const tableMap = new Map<string, ColumnInfo[]>();
  for (const row of rows) {
    const cols = tableMap.get(row.table_name) ?? [];
    cols.push(row);
    tableMap.set(row.table_name, cols);
  }

  const tables: TableSchema[] = Array.from(tableMap.entries()).map(
    ([name, columns]) => ({ name, columns }),
  );

  cached = { tables, cachedAt: Date.now() };
  return tables;
}

export function clearSchemaCache(): void {
  cached = null;
}
