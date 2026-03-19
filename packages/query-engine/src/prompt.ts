import type { TableSchema, InferredRelation } from "./types";
import type { AppSchemaDescription } from "./app-db";
import type { DbType } from "./driver";

export type SchemaDescriptions = Map<string, string>;

/** Convert DB rows to a lookup Map. Key: "table" or "table.column" */
export function buildDescriptionsMap(rows: AppSchemaDescription[]): SchemaDescriptions {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = row.column_name
      ? `${row.table_name}.${row.column_name}`
      : row.table_name;
    map.set(key, row.description);
  }
  return map;
}

export function buildSchemaText(
  tables: TableSchema[],
  descriptions?: SchemaDescriptions,
): string {
  return tables
    .map((t) => {
      const rowInfo =
        t.rowCount != null && t.rowCount > 0 ? ` (~${t.rowCount.toLocaleString("en-US")} rows)` : "";
      const tableDesc = descriptions?.get(t.name);
      const tableHeader = tableDesc
        ? `  ${t.name}${rowInfo}:  -- ${tableDesc}`
        : `  ${t.name}${rowInfo}:`;
      const cols = t.columns
        .map((c) => {
          // Show actual enum type name instead of "USER-DEFINED"
          const typeName =
            c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type;
          let line = `    ${c.column_name} ${typeName}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? ` DEFAULT ${c.column_default}` : ""}`;
          if (c.enum_values && c.enum_values.length > 0) {
            line += ` -- enum values: ${c.enum_values.map((v) => `'${v}'`).join(", ")}`;
          }
          const colDesc = descriptions?.get(`${t.name}.${c.column_name}`);
          if (colDesc) {
            line += line.includes(" -- ") ? `  (${colDesc})` : `  -- ${colDesc}`;
          }
          return line;
        })
        .join("\n");
      return `${tableHeader}\n${cols}`;
    })
    .join("\n\n");
}

export function buildRelationsText(relations: InferredRelation[]): string {
  if (relations.length === 0) return "";
  const lines = relations.map(
    (r) => `  ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`,
  );
  return `\nRELATIONSHIPS (inferred foreign keys — use for JOINs):\n${lines.join("\n")}`;
}

const DB_LABELS: Record<DbType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};

const DB_SYNTAX_RULES: Record<DbType, string> = {
  postgresql: `3. Use proper PostgreSQL syntax. Use CTEs, window functions, subqueries as needed.
   Use ::date for date casting, COALESCE for null handling, || for string concatenation.`,
  mysql: `3. Use proper MySQL syntax. Use CTEs (WITH), window functions, subqueries as needed.
   Use DATE() for date casting, IFNULL/COALESCE for null handling, CONCAT() for string concatenation.
   Use LIMIT for row limits. Use backticks for reserved words.`,
  sqlite: `3. Use proper SQLite syntax. Use CTEs (WITH), subqueries as needed.
   Use DATE() for date functions, IFNULL/COALESCE for null handling, || for string concatenation.
   SQLite has limited window function support. Use LIMIT for row limits.`,
};

const DB_EXAMPLES: Record<DbType, string> = {
  postgresql: `EXAMPLE — multi-table aggregation with JOIN:
Question: "Show top 10 users by total fees paid"
SQL:
SELECT
  u.id,
  COALESCE(u.username, u.email, u.first_name || ' ' || u.last_name) AS user_name,
  SUM(o.fee) AS total_fees,
  COUNT(*) AS operations_count,
  MIN(o.created_at)::date AS first_operation,
  MAX(o.created_at)::date AS last_operation
FROM operations o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'success' AND o.fee > 0
GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
ORDER BY total_fees DESC
LIMIT 10`,
  mysql: `EXAMPLE — multi-table aggregation with JOIN:
Question: "Show top 10 users by total fees paid"
SQL:
SELECT
  u.id,
  COALESCE(u.username, u.email, CONCAT(u.first_name, ' ', u.last_name)) AS user_name,
  SUM(o.fee) AS total_fees,
  COUNT(*) AS operations_count,
  DATE(MIN(o.created_at)) AS first_operation,
  DATE(MAX(o.created_at)) AS last_operation
FROM operations o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'success' AND o.fee > 0
GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
ORDER BY total_fees DESC
LIMIT 10`,
  sqlite: `EXAMPLE — multi-table aggregation with JOIN:
Question: "Show top 10 users by total fees paid"
SQL:
SELECT
  u.id,
  COALESCE(u.username, u.email, u.first_name || ' ' || u.last_name) AS user_name,
  SUM(o.fee) AS total_fees,
  COUNT(*) AS operations_count,
  DATE(MIN(o.created_at)) AS first_operation,
  DATE(MAX(o.created_at)) AS last_operation
FROM operations o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'success' AND o.fee > 0
GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
ORDER BY total_fees DESC
LIMIT 10`,
};

export function buildSystemPrompt(
  tables: TableSchema[],
  relations: InferredRelation[] = [],
  descriptions?: SchemaDescriptions,
  dbType: DbType = "postgresql",
): string {
  const schemaText = buildSchemaText(tables, descriptions);
  const relationsText = buildRelationsText(relations);
  const today = new Date().toISOString().slice(0, 10);
  const dbLabel = DB_LABELS[dbType];

  return `You are an expert SQL analyst for a ${dbLabel} database. Your job is to convert natural language questions into the best possible SQL query to retrieve relevant data.

TODAY: ${today}
Use this date as reference for all relative time expressions ("this month", "last week", "in January", "yesterday", etc.). When a month is mentioned without a year, assume the current year (${new Date().getFullYear()}).

DATABASE: ${dbLabel}

DATABASE SCHEMA:
${schemaText}
${relationsText}

RULES:
1. Output ONLY the SQL query — no explanations, no markdown, no code blocks.
2. ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or any data-modifying statement.
${DB_SYNTAX_RULES[dbType]}
4. The question has been pre-translated to English. Use English column aliases.
5. Limit results to 50 rows unless the user requests more.
6. CRITICAL: ONLY use tables and columns that exist in the schema above. NEVER invent or guess table/column names. If the question asks about data that doesn't exist in the schema, respond with \`-- UNSUPPORTED: brief reason\`.
7. For aggregations, always include meaningful aliases.
8. For columns with allowed values listed (-- enum values: ...), ONLY use those exact values. Never guess or invent values.
9. If the question maps to an existing concept in the schema under a different name (e.g. "deposits" could mean orders, "commissions" could mean fee column), use the closest matching table/column. If no reasonable mapping exists, respond with \`-- UNSUPPORTED\`.
10. When a question asks about users/people by name, ALWAYS JOIN with the users table to show human-readable identifiers (username, email, first_name).
11. Use the RELATIONSHIPS section to determine correct JOINs. If a table has user_id, join it with users.id. If it has team_id, join with teams.id, etc.
12. For "top N" or ranking questions, always include supporting context columns (counts, date ranges, totals) so results are informative — not just bare numbers.

ANALYTICAL QUESTIONS:
- For "why" or comparison questions, generate SQL that retrieves the comparison data needed to reason about it.
- For broad analytical questions, use CTEs to gather multiple perspectives in one query.
- Think step-by-step about what data would help answer the question, then write the SQL to get it.
- If the question is about data that has no representation in the schema at all, respond with \`-- UNSUPPORTED: reason\` explaining what data is missing.

${DB_EXAMPLES[dbType]}`;
}

export function buildAnalysisPrompt(tables: TableSchema[]): string {
  return `You are an expert data analyst. You are given a user's question, the SQL query that was executed, and the results. Provide a clear, insightful analysis in the same language as the question.

RULES:
1. Answer the user's question directly based on the data.
2. Highlight key findings, trends, and anomalies.
3. If the question asks "why", reason about possible causes based on the data patterns.
4. Keep the analysis concise (3-8 sentences).
5. Use numbers and percentages from the data to support your points.
6. Respond in the same language as the user's question.
7. Do NOT include SQL or technical details — focus on business insights.

ANOMALY DETECTION:
- Look for statistical outliers, unusual patterns, or unexpected values in the data.
- If you detect anomalies, add a separate paragraph starting with "⚠️" describing:
  - Which values are anomalous and why (e.g., "3x above average", "10x higher than median", sudden spike/drop)
  - Possible explanations or areas to investigate
- If no anomalies are detected, do not mention anomalies at all.

FORMATTING:
- Use Telegram HTML tags ONLY: <b>bold</b>, <i>italic</i>, <code>code</code>
- Do NOT use Markdown (no **, ##, -, etc.)
- Use plain newlines for paragraphs, not headers
- Use <b> for key numbers and important terms
- Keep it as readable plain text with minimal formatting`;
}
