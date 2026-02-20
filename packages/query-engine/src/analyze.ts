import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema } from "./types";
import { buildAnalysisPrompt } from "./prompt";

export async function analyzeResults(
  question: string,
  sql: string,
  rows: Record<string, unknown>[],
  fields: string[],
  rowCount: number,
  tables: TableSchema[],
): Promise<string> {
  // Build a text representation of the results (first 30 rows)
  const displayRows = rows.slice(0, 30);
  let dataText = "";

  if (fields.length > 0 && displayRows.length > 0) {
    const header = fields.join(" | ");
    const rowLines = displayRows.map((row) =>
      fields.map((f) => String(row[f] ?? "null")).join(" | "),
    );
    dataText = `${header}\n${rowLines.join("\n")}`;
    if (rowCount > 30) {
      dataText += `\n... (${rowCount} rows total, showing first 30)`;
    }
  } else {
    dataText = "(no results)";
  }

  const userMessage = `QUESTION: ${question}

SQL EXECUTED:
${sql}

RESULTS (${rowCount} rows):
${dataText}

Provide your analysis:`;

  const { text } = await generateText({
    model: anthropic("claude-opus-4-6"),
    system: buildAnalysisPrompt(tables),
    prompt: userMessage,
    maxTokens: 1024,
    temperature: 0.3,
  });

  return text.trim();
}
