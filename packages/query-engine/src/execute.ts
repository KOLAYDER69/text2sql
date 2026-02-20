import type { Pool } from "pg";
import type { QueryResult } from "./types";

const STATEMENT_TIMEOUT_MS = 10_000;

export async function executeSQL(
  pool: Pool,
  sql: string,
): Promise<QueryResult> {
  const start = Date.now();

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(sql);
    const executionMs = Date.now() - start;

    return {
      sql,
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
      fields: result.fields.map((f) => f.name),
      executionMs,
    };
  } finally {
    client.release();
  }
}
