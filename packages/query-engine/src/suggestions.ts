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
      "Output exactly 4 questions in Russian, one per line, no numbering, no bullets, no extra text. " +
      "Questions must be based ONLY on the provided schema — use real table and column names. " +
      "Be creative and diverse every time: mix aggregations, filters, joins, top-N, date ranges, comparisons, trends. " +
      "Never repeat the same set of questions. Each question should reveal an interesting business insight.",
    prompt: `Database schema:\n${schemaText}\n\nGenerate 4 unique and interesting analytical questions:`,
    maxTokens: 300,
    temperature: 1.0,
  });

  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("Not enough suggestions generated");
  }

  return lines.slice(0, 4);
}

export async function generatePersonalSuggestions(
  tables: TableSchema[],
  recentQuestions: string[],
): Promise<string[]> {
  if (recentQuestions.length === 0) return [];

  const schemaText = tables
    .map(
      (t) =>
        `${t.name}: ${t.columns.map((c) => `${c.column_name} (${c.data_type})`).join(", ")}`,
    )
    .join("\n");

  const historyText = recentQuestions.slice(0, 15).join("\n");

  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system:
      "You generate personalized follow-up questions for a natural-language SQL query interface. " +
      "Based on the user's recent queries, suggest 2 NEW related questions they might find interesting. " +
      "Output exactly 2 questions in Russian, one per line, no numbering, no bullets, no extra text. " +
      "Questions must be based ONLY on the provided schema. " +
      "Build on the user's interests — dig deeper into the same topics or suggest related angles they haven't explored.",
    prompt: `Database schema:\n${schemaText}\n\nUser's recent queries:\n${historyText}\n\nGenerate 2 personalized follow-up questions:`,
    maxTokens: 200,
    temperature: 0.8,
  });

  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((l) => l.length > 0);

  return lines.slice(0, 2);
}
