import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema } from "./types";

export async function generateDescriptionSuggestions(
  table: TableSchema,
  columnName: string | null,
  existingDescriptions: Map<string, string>,
): Promise<string[]> {
  // Build context: full table structure with types, enums, row count, existing descriptions
  const colLines = table.columns.map((c) => {
    const typeName = c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type;
    const nullable = c.is_nullable === "YES" ? ", nullable" : "";
    const def = c.column_default ? `, default: ${c.column_default}` : "";
    const enums = c.enum_values?.length
      ? `, values: [${c.enum_values.join(", ")}]`
      : "";

    // Check if this column already has a description
    const descKey = `${table.name}.${c.column_name}`;
    const desc = existingDescriptions.get(descKey);
    const descText = desc ? ` — "${desc}"` : "";

    return `  ${c.column_name} (${typeName}${nullable}${def}${enums})${descText}`;
  });

  const tableDesc = existingDescriptions.get(table.name);
  const tableDescLine = tableDesc ? `\nОписание таблицы: "${tableDesc}"` : "";
  const rowCountLine =
    table.rowCount !== undefined ? `\nПримерное количество строк: ~${table.rowCount}` : "";

  const target = columnName
    ? `колонку "${columnName}" в таблице "${table.name}"`
    : `таблицу "${table.name}"`;

  const { text } = await generateText({
    model: anthropic("claude-opus-4-6"),
    system:
      "Ты — эксперт по базам данных. Анализируй структуру таблицы и предлагай точные, " +
      "лаконичные описания на русском языке. Описания должны помогать AI-системе " +
      "генерировать правильные SQL-запросы. " +
      "Верни ровно 4 варианта описания в формате JSON-массива строк. " +
      "Каждый вариант — 1-2 предложения, конкретно и по делу. " +
      "Не добавляй ничего кроме JSON-массива.",
    prompt:
      `Таблица: ${table.name}${tableDescLine}${rowCountLine}\n` +
      `Колонки:\n${colLines.join("\n")}\n\n` +
      `Предложи 4 варианта описания для ${target}.\n` +
      `Ответ — только JSON-массив из 4 строк.`,
    maxTokens: 512,
    temperature: 0.7,
  });

  // Parse JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const arr = JSON.parse(match[0]);
    if (Array.isArray(arr)) {
      return arr.filter((s): s is string => typeof s === "string").slice(0, 4);
    }
  } catch {
    // Fallback: try line-by-line
  }

  return [];
}
