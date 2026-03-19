import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema, InferredRelation } from "./types";
import type { DbType } from "./driver";
import { buildSystemPrompt, buildSchemaText, buildRelationsText, type SchemaDescriptions } from "./prompt";

const DB_LABELS: Record<DbType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};

export async function generateSQL(
  question: string,
  tables: TableSchema[],
  relations: InferredRelation[] = [],
  descriptions?: SchemaDescriptions,
  dbType: DbType = "postgresql",
): Promise<string> {
  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(tables, relations, descriptions, dbType),
    prompt: question,
    maxTokens: 1024,
    temperature: 0,
  });

  // Strip markdown code fences if model wraps them
  let sql = text.trim();
  if (sql.startsWith("```")) {
    sql = sql.replace(/^```(?:sql)?\n?/, "").replace(/\n?```$/, "");
  }

  return sql.trim();
}

export type FixSuggestion = {
  suggestion: string;
  fixedSql?: string;
};

export async function suggestQueryFix(
  question: string,
  sql: string,
  error: string,
  tables: TableSchema[],
  relations: InferredRelation[],
  descriptions?: SchemaDescriptions,
  dbType: DbType = "postgresql",
): Promise<FixSuggestion> {
  const schemaText = buildSchemaText(tables, descriptions);
  const relationsText = buildRelationsText(relations);
  const dbLabel = DB_LABELS[dbType];

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: `You are a ${dbLabel} expert. The user ran a query that failed. Analyze the error and suggest a fix.

Available schema:
${schemaText}
${relationsText ? `\nRelations:\n${relationsText}` : ""}

Respond in EXACTLY this format:
EXPLANATION: <1-2 sentence explanation of why the query failed and how to fix it, in the same language as the question>
FIXED_SQL: <corrected SQL query, or NONE if the query cannot be fixed>`,
    prompt: `Question: ${question}
SQL: ${sql}
Error: ${error}`,
    maxTokens: 1024,
    temperature: 0,
  });

  const explanationMatch = text.match(/EXPLANATION:\s*(.+?)(?=\nFIXED_SQL:)/s);
  const fixedSqlMatch = text.match(/FIXED_SQL:\s*(.+)/s);

  const suggestion = explanationMatch?.[1]?.trim() || text.trim();
  const rawSql = fixedSqlMatch?.[1]?.trim();
  let fixedSql: string | undefined;

  if (rawSql && rawSql !== "NONE") {
    fixedSql = rawSql.replace(/^```(?:sql)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  return { suggestion, fixedSql };
}
