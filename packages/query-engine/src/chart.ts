import type { ChartConfig } from "./types";

type FieldType = "date" | "numeric" | "text";

const MAX_ROWS = 200;
const MAX_LABEL_LEN = 25;
const MAX_DATASETS = 5;

const DATE_RE =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export function classifyField(
  field: string,
  rows: Record<string, unknown>[],
): FieldType {
  // Sample up to 20 rows
  const sample = rows.slice(0, 20);
  let dateCount = 0;
  let numCount = 0;
  let total = 0;

  for (const row of sample) {
    const val = row[field];
    if (val == null || val === "") continue;
    total++;

    if (val instanceof Date) {
      dateCount++;
      continue;
    }

    const str = String(val);
    if (DATE_RE.test(str.trim())) {
      dateCount++;
    } else if (!isNaN(Number(str)) && str.trim() !== "") {
      numCount++;
    }
  }

  if (total === 0) return "text";
  if (dateCount / total >= 0.8) return "date";
  if (numCount / total >= 0.8) return "numeric";
  return "text";
}

function truncLabel(val: unknown): string {
  const s = String(val ?? "");
  return s.length > MAX_LABEL_LEN ? s.slice(0, MAX_LABEL_LEN - 1) + "\u2026" : s;
}

export function buildChartConfig(
  fields: string[],
  rows: Record<string, unknown>[],
): ChartConfig | null {
  if (!rows.length || rows.length > MAX_ROWS || fields.length < 2) return null;

  const types = new Map<string, FieldType>();
  for (const f of fields) {
    types.set(f, classifyField(f, rows));
  }

  const dateFields = fields.filter((f) => types.get(f) === "date");
  const numFields = fields.filter((f) => types.get(f) === "numeric");
  const textFields = fields.filter((f) => types.get(f) === "text");

  if (numFields.length === 0) return null;

  // Date + numbers → line chart
  if (dateFields.length >= 1) {
    const labelField = dateFields[0];
    const valueFields = numFields.slice(0, MAX_DATASETS);

    return {
      type: "line",
      labels: rows.map((r) => truncLabel(r[labelField])),
      datasets: valueFields.map((f) => ({
        label: f,
        data: rows.map((r) => Number(r[f]) || 0),
      })),
    };
  }

  // Text + numbers
  if (textFields.length >= 1) {
    const labelField = textFields[0];

    // Pie: text + 1 number, ≤6 rows
    if (numFields.length === 1 && rows.length <= 6) {
      return {
        type: "pie",
        labels: rows.map((r) => truncLabel(r[labelField])),
        datasets: [
          {
            label: numFields[0],
            data: rows.map((r) => Number(r[numFields[0]]) || 0),
          },
        ],
      };
    }

    // Bar: text + numbers, ≤12 rows
    if (rows.length <= 12) {
      const valueFields = numFields.slice(0, MAX_DATASETS);
      return {
        type: "bar",
        labels: rows.map((r) => truncLabel(r[labelField])),
        datasets: valueFields.map((f) => ({
          label: f,
          data: rows.map((r) => Number(r[f]) || 0),
        })),
      };
    }
  }

  return null;
}
