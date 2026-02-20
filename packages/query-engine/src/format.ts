import type { QueryResult } from "./types";

/** Format as plain-text table for Telegram (HTML parse mode) */
export function formatTelegram(result: QueryResult): string {
  if (result.rows.length === 0) {
    return "<i>Нет результатов</i>";
  }

  const { fields, rows } = result;

  // Calculate column widths
  const widths = fields.map((f) =>
    Math.max(
      f.length,
      ...rows.map((r) => String(r[f] ?? "").length),
    ),
  );

  // Cap widths at 20 to avoid overflow
  const cappedWidths = widths.map((w) => Math.min(w, 20));

  const header = fields
    .map((f, i) => f.slice(0, cappedWidths[i]).padEnd(cappedWidths[i]))
    .join(" | ");

  const separator = cappedWidths.map((w) => "─".repeat(w)).join("─┼─");

  const body = rows
    .slice(0, 50)
    .map((row) =>
      fields
        .map((f, i) =>
          String(row[f] ?? "")
            .slice(0, cappedWidths[i])
            .padEnd(cappedWidths[i]),
        )
        .join(" | "),
    )
    .join("\n");

  let text = `<pre>${header}\n${separator}\n${body}</pre>`;

  if (rows.length > 50) {
    text += `\n<i>... показано 50 из ${rows.length} строк</i>`;
  }

  text += `\n\n<i>${result.rowCount} строк · ${result.executionMs}мс</i>`;

  return text;
}

/** Format as HTML table for web */
export function formatHTML(result: QueryResult): string {
  if (result.rows.length === 0) {
    return "<p><em>Нет результатов</em></p>";
  }

  const { fields, rows } = result;

  const headerCells = fields.map((f) => `<th>${escapeHtml(f)}</th>`).join("");

  const bodyRows = rows
    .map(
      (row) =>
        "<tr>" +
        fields
          .map((f) => `<td>${escapeHtml(String(row[f] ?? ""))}</td>`)
          .join("") +
        "</tr>",
    )
    .join("");

  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
