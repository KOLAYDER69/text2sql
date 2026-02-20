const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "EXECUTE",
  "CALL",
  "DO",
];

const FORBIDDEN_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`,
  "i",
);

export function validateSQL(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();

  if (trimmed === "-- UNSUPPORTED") {
    return {
      valid: false,
      error: "Этот вопрос не может быть отвечен с текущей схемой базы данных.",
    };
  }

  if (!trimmed.toUpperCase().startsWith("SELECT") && !trimmed.toUpperCase().startsWith("WITH")) {
    return {
      valid: false,
      error: "Разрешены только SELECT-запросы.",
    };
  }

  if (FORBIDDEN_PATTERN.test(trimmed.replace(/^(SELECT|WITH)\b/i, ""))) {
    return {
      valid: false,
      error: "Запрос содержит запрещённые операции.",
    };
  }

  return { valid: true };
}
