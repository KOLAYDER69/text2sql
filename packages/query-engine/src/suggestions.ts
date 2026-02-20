import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema } from "./types";

export async function generateSuggestions(
  tables: TableSchema[],
): Promise<string[]> {
  const schemaText = tables
    .map(
      (t) =>
        `${t.name}: ${t.columns.map((c) => `${c.column_name} (${c.data_type})`).join(", ")}`,
    )
    .join("\n");

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system:
      "You generate example questions for a natural-language SQL query interface. " +
      "Output exactly 6 questions in Russian, one per line, no numbering, no bullets, no extra text. " +
      "Questions must be based ONLY on the provided schema — use real table and column names. " +
      "Be creative and diverse every time: mix aggregations, filters, joins, top-N, date ranges, comparisons, trends. " +
      "Never repeat the same set of questions. Each question should reveal an interesting business insight.",
    prompt: `Database schema:\n${schemaText}\n\nGenerate 6 unique and interesting analytical questions:`,
    maxTokens: 400,
    temperature: 1.0,
  });

  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((l) => l.length > 0);

  if (lines.length < 3) {
    throw new Error("Not enough suggestions generated");
  }

  return lines.slice(0, 6);
}
