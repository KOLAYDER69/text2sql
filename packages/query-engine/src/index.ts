import pg from "pg";
import { getSchema, clearSchemaCache } from "./introspect";
import { generateSQL } from "./generate";
import { validateSQL } from "./validate";
import { executeSQL } from "./execute";
import { analyzeResults } from "./analyze";
import { formatTelegram, formatHTML } from "./format";
import { buildChartConfig } from "./chart";
import { translateQuestion } from "./translate";
import type { SchemaDescriptions } from "./prompt";
import type { QueryResponse } from "./types";
import type { DbDriver, DbType } from "./driver";

export { getSchema, clearSchemaCache } from "./introspect";
export { generateSQL, suggestQueryFix } from "./generate";
export type { FixSuggestion } from "./generate";
export { validateSQL } from "./validate";
export { executeSQL } from "./execute";
export { analyzeResults, answerFollowUp } from "./analyze";
export type { FollowUpMessage } from "./analyze";
export { formatTelegram, formatHTML } from "./format";
export { buildSystemPrompt, buildSchemaText, buildRelationsText, buildDescriptionsMap } from "./prompt";
export type { SchemaDescriptions } from "./prompt";
export { generateSuggestions, generatePersonalSuggestions } from "./suggestions";
export { buildChartConfig } from "./chart";
export { translateQuestion } from "./translate";
export { generateClarifications } from "./clarify";
export { generateDescriptionSuggestions } from "./suggest";
export type { ClarifyQuestion, ClarifyResult } from "./clarify";
export * from "./types";
export * from "./app-db";
export { createDriver, detectDbType } from "./driver";
export type { DbDriver, DbType } from "./driver";

/** Create a PostgreSQL pool (legacy, for backwards compatibility) */
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
}

/** Create an app database pool (always PostgreSQL) */
export function createAppPool(appDatabaseUrl: string): pg.Pool {
  const isLocalhost = appDatabaseUrl.includes("@localhost") || appDatabaseUrl.includes("@127.0.0.1");
  return new pg.Pool({
    connectionString: appDatabaseUrl,
    max: 5,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });
}

/** Full pipeline: question → translate → SQL → results → analysis */
export async function query(
  pool: pg.Pool,
  question: string,
  descriptions?: SchemaDescriptions,
): Promise<QueryResponse> {
  // 1. Get schema + translate question to English (in parallel)
  const [schema, translated] = await Promise.all([
    getSchema(pool),
    translateQuestion(question),
  ]);
  const { tables, relations } = schema;

  // 2. Generate SQL from English question (more reliable)
  const sql = await generateSQL(translated.english, tables, relations, descriptions);

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

    // 5. Analyze results with AI
    let analysis: string | undefined;
    try {
      analysis = await analyzeResults(
        question,
        result.sql,
        result.rows,
        result.fields,
        result.rowCount,
        tables,
      );
    } catch {
      // Analysis is non-critical — skip on error
    }

    // 6. Build chart config (if data is suitable)
    const chart = buildChartConfig(result.fields, result.rows) ?? undefined;

    return {
      question,
      sql: result.sql,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionMs: result.executionMs,
      analysis,
      chart,
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

/** Full pipeline using universal DbDriver (works with PostgreSQL, MySQL, SQLite) */
export async function queryWithDriver(
  driver: DbDriver,
  question: string,
  descriptions?: SchemaDescriptions,
): Promise<QueryResponse> {
  const [schema, translated] = await Promise.all([
    driver.introspect(),
    translateQuestion(question),
  ]);
  const { tables, relations } = schema;

  const sql = await generateSQL(translated.english, tables, relations, descriptions, driver.type);

  const validation = validateSQL(sql);
  if (!validation.valid) {
    return { question, sql, rows: [], rowCount: 0, fields: [], executionMs: 0, error: validation.error };
  }

  try {
    const result = await driver.execute(sql);

    let analysis: string | undefined;
    try {
      analysis = await analyzeResults(question, result.sql, result.rows, result.fields, result.rowCount, tables);
    } catch { /* non-critical */ }

    const chart = buildChartConfig(result.fields, result.rows) ?? undefined;

    return {
      question,
      sql: result.sql,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionMs: result.executionMs,
      analysis,
      chart,
    };
  } catch (err) {
    return { question, sql, rows: [], rowCount: 0, fields: [], executionMs: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
