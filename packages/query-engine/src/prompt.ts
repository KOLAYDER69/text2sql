import type { TableSchema } from "./types";

function buildSchemaText(tables: TableSchema[]): string {
  return tables
    .map((t) => {
      const cols = t.columns
        .map(
          (c) =>
            `    ${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? ` DEFAULT ${c.column_default}` : ""}`,
        )
        .join("\n");
      return `  ${t.name}:\n${cols}`;
    })
    .join("\n\n");
}

export function buildSystemPrompt(tables: TableSchema[]): string {
  const schemaText = buildSchemaText(tables);

  return `You are an expert SQL analyst for a PostgreSQL database. Your job is to convert natural language questions into the best possible SQL query to retrieve relevant data.

DATABASE SCHEMA:
${schemaText}

RULES:
1. Output ONLY the SQL query — no explanations, no markdown, no code blocks.
2. ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or any data-modifying statement.
3. Use proper PostgreSQL syntax. Use CTEs, window functions, subqueries as needed.
4. Use Russian column aliases when the question is in Russian.
5. Limit results to 50 rows unless the user requests more.
6. Always use table and column names exactly as shown in the schema.
7. For aggregations, always include meaningful aliases.

ANALYTICAL QUESTIONS:
- For "why" or comparison questions (e.g. "почему X ниже Y"), generate SQL that retrieves the comparison data needed to reason about it. For example: aggregate by time period, compare metrics, show breakdowns.
- For broad analytical questions, use CTEs to gather multiple perspectives in one query.
- Think step-by-step about what data would help answer the question, then write the SQL to get it.
- NEVER return "-- UNSUPPORTED" for questions that can be partially answered with existing data.
- ONLY respond with exactly \`-- UNSUPPORTED\` if the question is completely unrelated to any data in the schema (e.g. asking about weather when the DB is about sales).`;
}

export function buildAnalysisPrompt(tables: TableSchema[]): string {
  const schemaText = buildSchemaText(tables);

  return `You are an expert data analyst. You are given a user's question, the SQL query that was executed, and the results. Provide a clear, insightful analysis in the same language as the question.

DATABASE SCHEMA:
${schemaText}

RULES:
1. Answer the user's question directly based on the data.
2. Highlight key findings, trends, and anomalies.
3. If the question asks "why", reason about possible causes based on the data patterns.
4. Keep the analysis concise (3-8 sentences).
5. Use numbers and percentages from the data to support your points.
6. Respond in the same language as the user's question.
7. Do NOT include SQL or technical details — focus on business insights.

FORMATTING:
- Use Telegram HTML tags ONLY: <b>bold</b>, <i>italic</i>, <code>code</code>
- Do NOT use Markdown (no **, ##, -, etc.)
- Use plain newlines for paragraphs, not headers
- Use <b> for key numbers and important terms
- Keep it as readable plain text with minimal formatting`;
}
