import type { TableSchema } from "./types";

export function buildSystemPrompt(tables: TableSchema[]): string {
  const schemaText = tables
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

  return `You are a SQL query generator for a PostgreSQL database. Your ONLY job is to convert natural language questions into SQL queries.

DATABASE SCHEMA:
${schemaText}

RULES:
1. Output ONLY the SQL query — no explanations, no markdown, no code blocks.
2. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, or any other data-modifying statement.
3. Use proper PostgreSQL syntax.
4. Use Russian column aliases when the question is in Russian.
5. If the question cannot be answered with the given schema, respond with exactly: -- UNSUPPORTED
6. Limit results to 50 rows maximum unless the user explicitly requests more.
7. Always use table and column names exactly as shown in the schema.
8. For aggregations, always include meaningful aliases.`;
}
