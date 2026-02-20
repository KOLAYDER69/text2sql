import type { Pool } from "pg";
import type { ColumnInfo, SchemaInfo, TableSchema } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: SchemaInfo | null = null;

export async function getSchema(pool: Pool): Promise<TableSchema[]> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tables;
  }

  // Three parallel queries:
  // 1. All columns with udt_name
  // 2. pg_enum values (for USER-DEFINED enum types)
  // 3. CHECK constraints (for text columns with allowed values)
  const [colResult, enumResult, checkResult] = await Promise.all([
    pool.query<ColumnInfo>(`
      SELECT table_name, column_name, data_type, udt_name,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name NOT LIKE 'pg\\_%' ESCAPE '\\'
        AND table_name NOT LIKE 'app\\_%' ESCAPE '\\'
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
    pool.query<{ table_name: string; constraint_def: string }>(`
      SELECT conrelid::regclass::text AS table_name,
             pg_get_constraintdef(oid) AS constraint_def
      FROM pg_constraint
      WHERE contype = 'c'
        AND connamespace = 'public'::regnamespace
    `),
  ]);

  // Build enum lookup: type_name → values[]
  const enumMap = new Map<string, string[]>();
  for (const row of enumResult.rows) {
    const vals = enumMap.get(row.type_name) ?? [];
    vals.push(row.enum_value);
    enumMap.set(row.type_name, vals);
  }

  // Parse CHECK constraints: table.column → allowed values
  // Matches: CHECK ((column = ANY (ARRAY['val1'::text, 'val2'::text, ...])))
  const checkMap = new Map<string, string[]>();
  const checkRe =
    /\(\((\w+)\s*=\s*ANY\s*\((?:ARRAY\[)?((?:'[^']*'(?:::[\w]+)?,?\s*)+)\]?\)\)\)/;
  for (const row of checkResult.rows) {
    const m = row.constraint_def.match(checkRe);
    if (m) {
      const colName = m[1];
      const values = [...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1]);
      if (values.length > 0) {
        checkMap.set(`${row.table_name}.${colName}`, values);
      }
    }
  }

  const tableMap = new Map<string, ColumnInfo[]>();
  for (const row of colResult.rows) {
    // Attach enum values from pg_enum
    if (row.data_type === "USER-DEFINED" && enumMap.has(row.udt_name)) {
      row.enum_values = enumMap.get(row.udt_name);
    }

    // Attach allowed values from CHECK constraints
    const checkKey = `${row.table_name}.${row.column_name}`;
    if (!row.enum_values && checkMap.has(checkKey)) {
      row.enum_values = checkMap.get(checkKey);
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
