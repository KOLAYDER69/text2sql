import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildSchemaText, buildRelationsText, type SchemaDescriptions } from "./prompt";
import type { TableSchema, InferredRelation } from "./types";

export type ClarifyQuestion = {
  question: string;
  options: string[];
};

export type ClarifyResult = {
  questions: ClarifyQuestion[];
};

export async function generateClarifications(
  question: string,
  englishQuestion: string,
  lang: string,
  tables: TableSchema[],
  relations: InferredRelation[],
  descriptions?: SchemaDescriptions,
): Promise<ClarifyResult> {
  try {
    const schemaText = buildSchemaText(tables, descriptions);
    const relationsText = buildRelationsText(relations);
    const today = new Date().toISOString().slice(0, 10);

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      temperature: 0,
      maxTokens: 512,
      system: `You are a database expert assistant. Your task is to analyze a user's question about a database and determine if it is ambiguous or needs clarification before generating SQL.

TODAY: ${today}
Use this date as reference for all relative time expressions and year options.

WHEN TO ASK clarifying questions:
- Ambiguous time range (e.g. "show transactions" — which period?)
- Unclear aggregation metric (e.g. "top users" — by what metric?)
- Multiple possible tables or entities could apply
- Missing important filter (e.g. status, type)
- Unclear status/state filter (e.g. "orders" — all or only successful?)

WHEN NOT TO ask:
- The question already specifies dates, filters, or limits (e.g. "top 10 users by fees in January 2025")
- Simple counts or schema exploration (e.g. "how many tables?", "show schema")
- Explicit filters are present (e.g. "successful transactions for user X")
- The question is clearly specific enough to generate SQL

RULES:
- Maximum 3 questions
- Each question must have 2-4 options
- Options must be concrete and reflect actual enum values, table names, or column names from the schema
- Respond in the language specified by the lang parameter
- Output ONLY valid JSON, no markdown, no code blocks

Output format:
{"questions": [{"question": "...", "options": ["...", "...", "..."]}]}

If the question is clear enough — return: {"questions": []}`,
      prompt: `DATABASE SCHEMA:
${schemaText}
${relationsText}

User question (original): ${question}
User question (English): ${englishQuestion}
Language for response: ${lang}

Analyze the question and return JSON with clarifying questions (or empty array if the question is clear).`,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { questions: [] };

    const parsed = JSON.parse(jsonMatch[0]) as ClarifyResult;
    if (!Array.isArray(parsed.questions)) return { questions: [] };

    // Validate structure
    const valid = parsed.questions
      .filter(
        (q): q is ClarifyQuestion =>
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          q.options.every((o) => typeof o === "string"),
      )
      .slice(0, 3);

    return { questions: valid };
  } catch {
    // Fail-safe: never block the pipeline
    return { questions: [] };
  }
}
