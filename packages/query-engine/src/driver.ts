/**
 * Database driver abstraction.
 * Supports PostgreSQL, MySQL, and SQLite.
 */

import type { ColumnInfo, TableSchema, InferredRelation, QueryResult } from "./types";

export type DbType = "postgresql" | "mysql" | "sqlite";

export interface DbDriver {
  type: DbType;
  query<T extends Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
  execute(sql: string): Promise<QueryResult>;
  introspect(): Promise<{ tables: TableSchema[]; relations: InferredRelation[] }>;
  close(): Promise<void>;
}

// --- Detect database type from URL ---
export function detectDbType(url: string): DbType {
  if (url.startsWith("mysql://") || url.startsWith("mysql2://")) return "mysql";
  if (url.endsWith(".db") || url.endsWith(".sqlite") || url.endsWith(".sqlite3") || url.startsWith("sqlite://")) return "sqlite";
  return "postgresql";
}

// --- PostgreSQL Driver ---
async function createPostgresDriver(url: string): Promise<DbDriver> {
  const pg = await import("pg");
  const isLocalhost = url.includes("@localhost") || url.includes("@127.0.0.1");
  const pool = new pg.default.Pool({
    connectionString: url,
    max: 5,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });

  return {
    type: "postgresql",

    async query<T extends Record<string, unknown>>(sql: string) {
      const result = await pool.query<T>(sql);
      return { rows: result.rows };
    },

    async execute(sql: string): Promise<QueryResult> {
      const start = Date.now();
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = 10000");
        const result = await client.query(sql);
        return {
          sql,
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
          fields: result.fields.map((f) => f.name),
          executionMs: Date.now() - start,
        };
      } finally {
        client.release();
      }
    },

    async introspect() {
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

      const enumMap = new Map<string, string[]>();
      for (const row of enumResult.rows) {
        const vals = enumMap.get(row.type_name) ?? [];
        vals.push(row.enum_value);
        enumMap.set(row.type_name, vals);
      }

      const checkMap = new Map<string, string[]>();
      const checkRe = /\(\((\w+)\s*=\s*ANY\s*\((?:ARRAY\[)?((?:'[^']*'(?:::[\w]+)?,?\s*)+)\]?\)\)\)/;
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

      const rowCountMap = new Map<string, number>();
      for (const row of countResult.rows) {
        rowCountMap.set(row.table_name, Number(row.row_count));
      }

      const tableMap = new Map<string, ColumnInfo[]>();
      for (const row of colResult.rows) {
        if (row.data_type === "USER-DEFINED" && enumMap.has(row.udt_name)) {
          row.enum_values = enumMap.get(row.udt_name);
        }
        const checkKey = `${row.table_name}.${row.column_name}`;
        if (!row.enum_values && checkMap.has(checkKey)) {
          row.enum_values = checkMap.get(checkKey);
        }
        const cols = tableMap.get(row.table_name) ?? [];
        cols.push(row);
        tableMap.set(row.table_name, cols);
      }

      const tables: TableSchema[] = Array.from(tableMap.entries()).map(
        ([name, columns]) => ({ name, columns, rowCount: rowCountMap.get(name) }),
      );

      return { tables, relations: inferRelations(tables) };
    },

    async close() {
      await pool.end();
    },
  };
}

// --- MySQL Driver ---
async function createMysqlDriver(url: string): Promise<DbDriver> {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({
    uri: url,
    waitForConnections: true,
    connectionLimit: 5,
  });

  return {
    type: "mysql",

    async query<T extends Record<string, unknown>>(sql: string) {
      const [rows] = await pool.execute(sql);
      return { rows: rows as T[] };
    },

    async execute(sql: string): Promise<QueryResult> {
      const start = Date.now();
      const conn = await pool.getConnection();
      try {
        await conn.execute("SET SESSION max_execution_time = 10000");
        const [rows, fields] = await conn.execute(sql);
        const resultRows = rows as Record<string, unknown>[];
        const fieldNames = (fields as Array<{ name: string }>)?.map((f) => f.name) ?? [];
        return {
          sql,
          rows: resultRows,
          rowCount: resultRows.length,
          fields: fieldNames,
          executionMs: Date.now() - start,
        };
      } finally {
        conn.release();
      }
    },

    async introspect() {
      // Get database name from URL
      const dbName = new URL(url.replace("mysql2://", "mysql://")).pathname.slice(1);

      // 1. Columns
      const [colRows] = await pool.execute(`
        SELECT TABLE_NAME AS table_name,
               COLUMN_NAME AS column_name,
               DATA_TYPE AS data_type,
               COLUMN_TYPE AS udt_name,
               IS_NULLABLE AS is_nullable,
               COLUMN_DEFAULT AS column_default
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `, [dbName]);

      // 2. ENUM values (MySQL stores them in COLUMN_TYPE like "enum('a','b','c')")
      const enumRegex = /^enum\((.+)\)$/i;
      const columns = (colRows as ColumnInfo[]).map((col) => {
        const m = col.udt_name.match(enumRegex);
        if (m) {
          col.enum_values = [...m[1].matchAll(/'([^']*)'/g)].map((v) => v[1]);
          col.data_type = "enum";
        }
        return col;
      });

      // 3. Row counts
      const [countRows] = await pool.execute(`
        SELECT TABLE_NAME AS table_name,
               TABLE_ROWS AS row_count
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
      `, [dbName]);

      const rowCountMap = new Map<string, number>();
      for (const r of countRows as Array<{ table_name: string; row_count: number }>) {
        rowCountMap.set(r.table_name, Number(r.row_count));
      }

      // Build tables
      const tableMap = new Map<string, ColumnInfo[]>();
      for (const col of columns) {
        if (col.table_name.startsWith("app_")) continue;
        const cols = tableMap.get(col.table_name) ?? [];
        cols.push(col);
        tableMap.set(col.table_name, cols);
      }

      const tables: TableSchema[] = Array.from(tableMap.entries()).map(
        ([name, cols]) => ({ name, columns: cols, rowCount: rowCountMap.get(name) }),
      );

      return { tables, relations: inferRelations(tables) };
    },

    async close() {
      await pool.end();
    },
  };
}

// --- SQLite Driver ---
async function createSqliteDriver(url: string): Promise<DbDriver> {
  const sqlite3 = await import("better-sqlite3");
  const dbPath = url.replace("sqlite://", "").replace("sqlite:", "");
  const db = (sqlite3.default as unknown as (path: string) => ReturnType<typeof sqlite3.default>)(dbPath);
  db.pragma("busy_timeout = 10000");

  return {
    type: "sqlite",

    async query<T extends Record<string, unknown>>(sql: string) {
      const rows = db.prepare(sql).all() as T[];
      return { rows };
    },

    async execute(sql: string): Promise<QueryResult> {
      const start = Date.now();
      const stmt = db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const fields = stmt.columns().map((c) => c.name);
      return {
        sql,
        rows,
        rowCount: rows.length,
        fields,
        executionMs: Date.now() - start,
      };
    },

    async introspect() {
      // Get all tables
      const tablesRaw = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE 'app_%'
        ORDER BY name
      `).all() as Array<{ name: string }>;

      const tables: TableSchema[] = [];

      for (const t of tablesRaw) {
        const columnsRaw = db.prepare(`PRAGMA table_info("${t.name}")`).all() as Array<{
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
        }>;

        const columns: ColumnInfo[] = columnsRaw.map((c) => ({
          table_name: t.name,
          column_name: c.name,
          data_type: c.type.toLowerCase() || "text",
          udt_name: c.type.toLowerCase() || "text",
          is_nullable: c.notnull ? "NO" : "YES",
          column_default: c.dflt_value,
        }));

        // Row count
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };

        tables.push({
          name: t.name,
          columns,
          rowCount: countRow.cnt,
        });
      }

      return { tables, relations: inferRelations(tables) };
    },

    async close() {
      db.close();
    },
  };
}

// --- Factory ---
export async function createDriver(url: string): Promise<DbDriver> {
  const type = detectDbType(url);
  switch (type) {
    case "mysql":
      return createMysqlDriver(url);
    case "sqlite":
      return createSqliteDriver(url);
    default:
      return createPostgresDriver(url);
  }
}

// --- Shared: infer relations from naming conventions ---
function inferRelations(tables: TableSchema[]): InferredRelation[] {
  const tableNames = new Set(tables.map((t) => t.name));
  const tableColTypes = new Map<string, Map<string, string>>();
  for (const t of tables) {
    const cols = new Map<string, string>();
    for (const c of t.columns) cols.set(c.column_name, c.data_type);
    tableColTypes.set(t.name, cols);
  }

  const relations: InferredRelation[] = [];
  const seen = new Set<string>();

  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.column_name.endsWith("_id") || c.column_name === "id") continue;
      const base = c.column_name.slice(0, -3);
      for (const cand of [`${base}s`, base, `${base}es`]) {
        if (tableNames.has(cand) && cand !== t.name) {
          const targetCols = tableColTypes.get(cand);
          if (targetCols?.has("id")) {
            const key = `${t.name}.${c.column_name}->${cand}.id`;
            if (!seen.has(key)) {
              seen.add(key);
              relations.push({ fromTable: t.name, fromColumn: c.column_name, toTable: cand, toColumn: "id" });
            }
            break;
          }
        }
      }
    }
  }
  return relations;
}
