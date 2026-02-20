import type { Pool } from "pg";
import type {
  ColumnInfo,
  SchemaInfo,
  TableSchema,
  InferredRelation,
} from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: SchemaInfo | null = null;

/** Infer FK-like relationships from column naming conventions.
 *  e.g. operations.user_id (bigint) + users.id (bigint) → relation */
function inferRelations(tables: TableSchema[]): InferredRelation[] {
  const tableNames = new Set(tables.map((t) => t.name));
  // Build lookup: tableName → Set of column names
  const tableColTypes = new Map<string, Map<string, string>>();
  for (const t of tables) {
    const cols = new Map<string, string>();
    for (const c of t.columns) {
      cols.set(c.column_name, c.data_type);
    }
    tableColTypes.set(t.name, cols);
  }

  const relations: InferredRelation[] = [];
  const seen = new Set<string>();

  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.column_name.endsWith("_id")) continue;
      if (c.column_name === "id") continue;

      // Try to find the referenced table:
      // user_id → users, team_id → teams, operation_id → operations, etc.
      const base = c.column_name.slice(0, -3); // strip "_id"

      // Try plural forms: user → users, card_type → card_types
      const candidates = [
        `${base}s`,
        base,
        `${base}es`,
        // Handle patterns like sender_id → users, receiver_id → users
      ];

      for (const cand of candidates) {
        if (tableNames.has(cand) && cand !== t.name) {
          const targetCols = tableColTypes.get(cand);
          if (targetCols?.has("id")) {
            const key = `${t.name}.${c.column_name}->${cand}.id`;
            if (!seen.has(key)) {
              seen.add(key);
              relations.push({
                fromTable: t.name,
                fromColumn: c.column_name,
                toTable: cand,
                toColumn: "id",
              });
            }
            break;
          }
        }
      }
    }
  }

  return relations;
}

export async function getSchema(
  pool: Pool,
): Promise<{ tables: TableSchema[]; relations: InferredRelation[] }> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { tables: cached.tables, relations: cached.relations };
  }

  // Four parallel queries:
  // 1. All columns with udt_name
  // 2. pg_enum values (for USER-DEFINED enum types)
  // 3. CHECK constraints (for text columns with allowed values)
  // 4. Approximate row counts from pg_class
  const [colResult, enumResult, checkResult, countResult] = await Promise.all([
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
    pool.query<{ table_name: string; row_count: string }>(`
      SELECT c.relname AS table_name,
             GREATEST(c.reltuples, 0)::bigint AS row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
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

  // Build row count lookup
  const rowCountMap = new Map<string, number>();
  for (const row of countResult.rows) {
    rowCountMap.set(row.table_name, Number(row.row_count));
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
    ([name, columns]) => ({
      name,
      columns,
      rowCount: rowCountMap.get(name),
    }),
  );

  const relations = inferRelations(tables);

  cached = { tables, relations, cachedAt: Date.now() };
  return { tables, relations };
}

export function clearSchemaCache(): void {
  cached = null;
}
