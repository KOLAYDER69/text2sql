import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export type TranslatedQuestion = {
  original: string;
  english: string;
  lang: string;
};

const EN_RE = /^[a-zA-Z0-9\s.,!?;:'"()\-+=%$#@&*/\\[\]{}<>~`^|_]+$/;

export async function translateQuestion(
  question: string,
): Promise<TranslatedQuestion> {
  // Skip translation if already English
  if (EN_RE.test(question.trim())) {
    return { original: question, english: question, lang: "en" };
  }

  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system:
      "You are a translator. Translate the user's database question to English. " +
      "Output ONLY two lines:\n" +
      "Line 1: the detected language code (e.g. ru, es, de, fr, zh)\n" +
      "Line 2: the English translation\n\n" +
      "Keep technical terms, table/column names, and numbers as-is. " +
      "Do not add explanations.",
    prompt: question,
    maxTokens: 256,
    temperature: 0,
  });

  const lines = text.trim().split("\n");
  if (lines.length < 2) {
    // Fallback: couldn't parse — use original
    return { original: question, english: question, lang: "en" };
  }

  return {
    original: question,
    english: lines.slice(1).join(" ").trim(),
    lang: lines[0].trim().toLowerCase(),
  };
}
