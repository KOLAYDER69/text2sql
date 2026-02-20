import pg from "pg";
import { getSchema, clearSchemaCache } from "./introspect";
import { generateSQL } from "./generate";
import { validateSQL } from "./validate";
import { executeSQL } from "./execute";
import { formatTelegram, formatHTML } from "./format";
import type { QueryResponse } from "./types";

export { getSchema, clearSchemaCache } from "./introspect";
export { generateSQL } from "./generate";
export { validateSQL } from "./validate";
export { executeSQL } from "./execute";
export { formatTelegram, formatHTML } from "./format";
export { buildSystemPrompt } from "./prompt";
export { generateSuggestions } from "./suggestions";
export * from "./types";
export * from "./app-db";

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
}

export function createAppPool(appDatabaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: appDatabaseUrl,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
}

/** Full pipeline: question → SQL → results */
export async function query(
  pool: pg.Pool,
  question: string,
): Promise<QueryResponse> {
  // 1. Get schema
  const tables = await getSchema(pool);

  // 2. Generate SQL
  const sql = await generateSQL(question, tables);

  // 3. Validate
  const validation = validateSQL(sql);
  if (!validation.valid) {
    return {
      question,
      sql,
      rows: [],
      rowCount: 0,
      fields: [],
      executionMs: 0,
      error: validation.error,
    };
  }

  // 4. Execute
  try {
    const result = await executeSQL(pool, sql);
    return {
      question,
      sql: result.sql,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionMs: result.executionMs,
    };
  } catch (err) {
    return {
      question,
      sql,
      rows: [],
      rowCount: 0,
      fields: [],
      executionMs: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
