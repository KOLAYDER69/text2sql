import type { Pool } from "pg";
import type { ColumnInfo, SchemaInfo, TableSchema } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: SchemaInfo | null = null;

export async function getSchema(pool: Pool): Promise<TableSchema[]> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tables;
  }

  // Two parallel queries:
  // 1. All columns with udt_name (actual type name for enums)
  // 2. Enum values — joined through column udt_name, no pg_namespace filter
  const [colResult, enumResult] = await Promise.all([
    pool.query<ColumnInfo>(`
      SELECT table_name, column_name, data_type, udt_name,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name NOT LIKE 'pg\\_%' ESCAPE '\\'
      ORDER BY table_name, ordinal_position
    `),
    pool.query<{ type_name: string; enum_value: string }>(`
      SELECT DISTINCT t.typname AS type_name, e.enumlabel AS enum_value,
             e.enumsortorder
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = c.udt_name
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE c.table_schema = 'public'
        AND c.data_type = 'USER-DEFINED'
      ORDER BY t.typname, e.enumsortorder
    `),
  ]);

  // Build enum lookup: type_name → values[]
  const enumMap = new Map<string, string[]>();
  for (const row of enumResult.rows) {
    const vals = enumMap.get(row.type_name) ?? [];
    vals.push(row.enum_value);
    enumMap.set(row.type_name, vals);
  }

  const tableMap = new Map<string, ColumnInfo[]>();
  for (const row of colResult.rows) {
    // Attach enum values by matching udt_name
    if (row.data_type === "USER-DEFINED" && enumMap.has(row.udt_name)) {
      row.enum_values = enumMap.get(row.udt_name);
    }

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
