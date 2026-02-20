import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { TableSchema, InferredRelation } from "./types";
import { buildSystemPrompt } from "./prompt";

export async function generateSQL(
  question: string,
  tables: TableSchema[],
  relations: InferredRelation[] = [],
): Promise<string> {
  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(tables, relations),
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
