import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema } from "./types";

const FALLBACK_SUGGESTIONS = [
  "Покажи топ-5 товаров по цене",
  "Сколько заказов в каждом статусе?",
  "Какой средний чек по городам?",
  "Покажи последние 10 заказов",
  "Какие товары заканчиваются на складе?",
];

export async function generateSuggestions(
  tables: TableSchema[],
): Promise<string[]> {
  try {
    const schemaText = tables
      .map(
        (t) =>
          `${t.name}: ${t.columns.map((c) => c.column_name).join(", ")}`,
      )
      .join("\n");

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system:
        "You generate example questions for a natural-language SQL query interface. " +
        "Output exactly 5 questions in Russian, one per line, no numbering, no extra text. " +
        "Questions should be diverse: aggregations, filters, joins, top-N, trends.",
      prompt: `Database schema:\n${schemaText}`,
      maxTokens: 256,
      temperature: 0.7,
    });

    const lines = text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines.length >= 3 ? lines.slice(0, 5) : FALLBACK_SUGGESTIONS;
  } catch {
    return FALLBACK_SUGGESTIONS;
  }
}
