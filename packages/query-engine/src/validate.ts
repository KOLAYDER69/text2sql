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

  if (trimmed.startsWith("-- UNSUPPORTED")) {
    // AI may include explanation after "-- UNSUPPORTED: ..."
    const reason = trimmed.slice("-- UNSUPPORTED".length).replace(/^[:\s]+/, "").trim();
    return {
      valid: false,
      error: reason || "This question cannot be answered with the available database schema.",
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
