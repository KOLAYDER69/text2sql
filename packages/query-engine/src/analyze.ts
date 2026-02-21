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

export type FollowUpMessage = { role: "user" | "assistant"; content: string };

export async function answerFollowUp(
  followUp: string,
  messages: FollowUpMessage[],
  context: {
    question: string;
    sql: string;
    rows: Record<string, unknown>[];
    fields: string[];
    rowCount: number;
  },
  tables: TableSchema[],
): Promise<string> {
  // Build data text (same logic as analyzeResults)
  const displayRows = context.rows.slice(0, 30);
  let dataText = "";

  if (context.fields.length > 0 && displayRows.length > 0) {
    const header = context.fields.join(" | ");
    const rowLines = displayRows.map((row) =>
      context.fields.map((f) => String(row[f] ?? "null")).join(" | "),
    );
    dataText = `${header}\n${rowLines.join("\n")}`;
    if (context.rowCount > 30) {
      dataText += `\n... (${context.rowCount} rows total, showing first 30)`;
    }
  } else {
    dataText = "(no results)";
  }

  // Build conversation history
  const historyText = messages
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");

  const userMessage = `ORIGINAL QUESTION: ${context.question}

SQL EXECUTED:
${context.sql}

RESULTS (${context.rowCount} rows):
${dataText}

CONVERSATION SO FAR:
${historyText}

FOLLOW-UP QUESTION: ${followUp}

Answer the follow-up question based on the data above:`;

  const { text } = await generateText({
    model: anthropic("claude-opus-4-6"),
    system: buildAnalysisPrompt(tables),
    prompt: userMessage,
    maxTokens: 1024,
    temperature: 0.3,
  });

  return text.trim();
}
