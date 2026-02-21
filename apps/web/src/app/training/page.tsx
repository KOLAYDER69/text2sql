"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";
import { HoloLogo } from "../holo-logo";

type ColumnInfo = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  enum_values?: string[];
};

type TableSchema = {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
};

type SchemaDescription = {
  id: number;
  table_name: string;
  column_name: string | null;
  description: string;
};

type UserInfo = {
  id: number;
  firstName: string;
  username: string | null;
  role: string;
  isVip?: boolean;
  canTrain?: boolean;
  canSchedule?: boolean;
};

type SaveState = "idle" | "saving" | "saved";

function SaveIndicator({ state }: { state: SaveState }) {
  const { t } = useI18n();
  if (state === "idle") return null;
  return (
    <span
      className={`text-[11px] shrink-0 transition-opacity duration-500 ${
        state === "saving"
          ? "text-blue-400 opacity-100"
          : "text-emerald-400 opacity-100 animate-fade-out"
      }`}
    >
      {state === "saving" ? t("training.saving") : t("training.saved")}
    </span>
  );
}

function DescriptionInput({
  placeholder,
  defaultValue,
  disabled,
  onSave,
  small,
}: {
  placeholder: string;
  defaultValue: string;
  disabled: boolean;
  onSave: (value: string) => Promise<void>;
  small?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const prevValue = useRef(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
    prevValue.current = defaultValue;
  }, [defaultValue]);

  const handleBlur = useCallback(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      onSave(value);
    }
  }, [value, onSave]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-transparent border-b border-white/10 focus:border-blue-500/50 outline-none transition text-white/70 placeholder:text-white/15 disabled:opacity-40 disabled:cursor-not-allowed ${
        small ? "text-xs sm:text-xs py-1 sm:py-0.5" : "text-sm py-1.5 sm:py-1"
      }`}
    />
  );
}

function TableAccordion({
  table,
  descriptions,
  isAdmin,
  onSave,
}: {
  table: TableSchema;
  descriptions: Map<string, string>;
  isAdmin: boolean;
  onSave: (tableName: string, columnName: string | null, description: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tableSaveState, setTableSaveState] = useState<SaveState>("idle");
  const [colSaveStates, setColSaveStates] = useState<Record<string, SaveState>>({});
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const tableDesc = descriptions.get(table.name) ?? "";
  const describedCols = table.columns.filter(
    (c) => descriptions.has(`${table.name}.${c.column_name}`),
  ).length;
  const totalCols = table.columns.length;
  const progress = totalCols > 0 ? describedCols / totalCols : 0;
  const hasTableDesc = !!tableDesc;

  async function handleSave(columnName: string | null, description: string) {
    const key = columnName ?? "__table__";
    if (columnName === null) {
      setTableSaveState("saving");
    } else {
      setColSaveStates((prev) => ({ ...prev, [key]: "saving" }));
    }

    await onSave(table.name, columnName, description);

    if (columnName === null) {
      setTableSaveState("saved");
    } else {
      setColSaveStates((prev) => ({ ...prev, [key]: "saved" }));
    }

    if (fadeTimers.current[key]) clearTimeout(fadeTimers.current[key]);
    fadeTimers.current[key] = setTimeout(() => {
      if (columnName === null) {
        setTableSaveState("idle");
      } else {
        setColSaveStates((prev) => ({ ...prev, [key]: "idle" }));
      }
    }, 2000);
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 sm:px-4 py-3 sm:py-3 hover:bg-white/[0.02] active:bg-white/[0.04] transition"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              className={`shrink-0 text-white/30 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            >
              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-sm font-medium truncate">{table.name}</span>
            {hasTableDesc && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mini progress bar */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/60 transition-all duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] text-white/25 tabular-nums">
              {describedCols}/{totalCols}
            </span>
          </div>
        </div>
        {/* Table description preview on mobile */}
        {tableDesc && !open && (
          <p className="text-[11px] text-white/30 mt-1 ml-[22px] sm:ml-[26px] truncate">
            {tableDesc}
          </p>
        )}
      </button>

      {open && (
        <div className="border-t border-white/10">
          {/* Table-level description */}
          <div className="px-3 sm:px-4 py-3 bg-white/[0.02] flex items-center gap-2 sm:gap-3">
            <DescriptionInput
              placeholder={t("training.tablePlaceholder")}
              defaultValue={tableDesc}
              disabled={!isAdmin}
              onSave={(desc) => handleSave(null, desc)}
            />
            <SaveIndicator state={tableSaveState} />
          </div>

          {/* Columns */}
          {table.columns.map((col) => {
            const colKey = `${table.name}.${col.column_name}`;
            const colDesc = descriptions.get(colKey) ?? "";
            const typeName = col.data_type === "USER-DEFINED" ? col.udt_name : col.data_type;
            const hasDesc = !!colDesc;

            return (
              <div
                key={col.column_name}
                className="px-3 sm:px-4 py-2 sm:py-2.5 border-t border-white/5"
              >
                {/* Mobile: stacked layout / Desktop: side by side */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  {/* Column name + type */}
                  <div className="flex items-center gap-1.5 sm:w-48 sm:shrink-0">
                    {hasDesc ? (
                      <span className="w-1 h-1 rounded-full bg-emerald-400/60 shrink-0" />
                    ) : (
                      <span className="w-1 h-1 rounded-full bg-white/10 shrink-0" />
                    )}
                    <span className="font-mono text-xs text-white/70 truncate">
                      {col.column_name}
                    </span>
                    <span className="text-[10px] text-white/20 shrink-0">{typeName}</span>
                  </div>
                  {/* Description input */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 pl-2.5 sm:pl-0">
                    <DescriptionInput
                      placeholder={t("training.columnPlaceholder")}
                      defaultValue={colDesc}
                      disabled={!isAdmin}
                      onSave={(desc) => handleSave(col.column_name, desc)}
                      small
                    />
                    <SaveIndicator state={colSaveStates[col.column_name] ?? "idle"} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type WizardItem = {
  tableName: string;
  columnName: string | null;
  label: string;
  level: "table" | "column";
  // Column metadata (for column-level items)
  dataType?: string;
  udtName?: string;
  isNullable?: string;
  columnDefault?: string | null;
  enumValues?: string[];
  rowCount?: number;
};

function TrainingWizard({
  items,
  tables,
  descriptions,
  onSave,
  onClose,
}: {
  items: WizardItem[];
  tables: TableSchema[];
  descriptions: Map<string, string>;
  onSave: (tableName: string, columnName: string | null, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  const item = items[index];
  const total = items.length;
  const progress = total > 0 ? (index / total) * 100 : 0;

  // Fetch AI suggestions when card changes
  useEffect(() => {
    if (!item) return;
    setSuggestions([]);
    setCustomValue("");
    setLoadingSuggestions(true);

    fetch("/api/schema/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_name: item.tableName,
        column_name: item.columnName,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.suggestions) setSuggestions(data.suggestions);
      })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, [index, item?.tableName, item?.columnName]);

  async function handleSelect(description: string) {
    if (!item || saving) return;
    setSaving(true);
    await onSave(item.tableName, item.columnName, description);
    setSaving(false);
    advance();
  }

  async function handleCustomSave() {
    if (!customValue.trim() || !item) return;
    await handleSelect(customValue.trim());
  }

  function advance() {
    if (index + 1 >= total) {
      setComplete(true);
    } else {
      setIndex(index + 1);
    }
  }

  function handleSkip() {
    advance();
  }

  if (complete) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">{t("training.wizardComplete")}</h3>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  // Find table info for metadata display
  const tableInfo = tables.find((t) => t.name === item.tableName);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 tabular-nums">
              {t("training.wizardCard")} {index + 1} {t("training.wizardOf")} {total}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              item.level === "table"
                ? "bg-blue-500/20 text-blue-300"
                : "bg-purple-500/20 text-purple-300"
            }`}>
              {item.level === "table" ? t("training.wizardTableLevel") : t("training.wizardColumnLevel")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-blue-500/60 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Card content */}
        <div className="p-4 space-y-4">
          {/* Item name */}
          <div>
            <h3 className="font-mono text-base font-semibold">{item.label}</h3>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            {item.level === "column" && item.dataType && (
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/50">
                {item.dataType === "USER-DEFINED" ? item.udtName : item.dataType}
              </span>
            )}
            {item.level === "column" && item.isNullable === "YES" && (
              <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300/60">
                nullable
              </span>
            )}
            {item.level === "column" && item.columnDefault && (
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40">
                default: {item.columnDefault}
              </span>
            )}
            {item.rowCount !== undefined && (
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40">
                ~{item.rowCount.toLocaleString()} rows
              </span>
            )}
            {item.enumValues && item.enumValues.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40 max-w-full truncate">
                [{item.enumValues.join(", ")}]
              </span>
            )}
          </div>

          {/* Existing table description context (for column-level items) */}
          {item.level === "column" && descriptions.get(item.tableName) && (
            <p className="text-[11px] text-white/30 italic">
              {item.tableName}: {descriptions.get(item.tableName)}
            </p>
          )}

          {/* AI Suggestions */}
          <div>
            <p className="text-xs text-white/40 mb-2">{t("training.wizardSuggestions")}</p>
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <div className="animate-spin h-4 w-4 border-2 border-white/20 border-t-blue-400 rounded-full" />
                <span className="text-xs text-white/30">{t("training.wizardGenerating")}</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(s)}
                    disabled={saving}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:border-blue-500/30 hover:bg-white/[0.06] transition text-sm text-white/70 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/20 py-2">No suggestions</p>
            )}
          </div>

          {/* Custom input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customValue.trim()) handleCustomSave();
              }}
              placeholder={t("training.wizardCustom")}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 transition"
            />
            <button
              onClick={handleCustomSave}
              disabled={!customValue.trim() || saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium transition shrink-0"
            >
              {t("training.wizardSave")}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 flex justify-between">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-white/30 hover:text-white/60 transition disabled:opacity-30"
          >
            {t("training.wizardSkip")}
          </button>
          <span className="text-[10px] text-white/20 tabular-nums self-center">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TrainingPage() {
  const { t } = useI18n();
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [descriptions, setDescriptions] = useState<Map<string, string>>(new Map());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const isAdmin = user?.role === "admin" || user?.canTrain === true;

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return r.json();
      }),
      fetch("/api/schema").then((r) => r.json()),
      fetch("/api/schema/descriptions").then((r) => r.json()),
    ])
      .then(([meData, schemaData, descData]) => {
        if (meData?.user) setUser(meData.user);
        if (schemaData?.tables) setTables(schemaData.tables);
        if (descData?.descriptions) {
          const map = new Map<string, string>();
          for (const d of descData.descriptions as SchemaDescription[]) {
            const key = d.column_name
              ? `${d.table_name}.${d.column_name}`
              : d.table_name;
            map.set(key, d.description);
          }
          setDescriptions(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(
    tableName: string,
    columnName: string | null,
    description: string,
  ) {
    try {
      await fetch("/api/schema/descriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: tableName,
          column_name: columnName,
          description,
        }),
      });

      setDescriptions((prev) => {
        const next = new Map(prev);
        const key = columnName ? `${tableName}.${columnName}` : tableName;
        if (description.trim()) {
          next.set(key, description.trim());
        } else {
          next.delete(key);
        }
        return next;
      });
    } catch {
      // ignore
    }
  }

  const filteredTables = search
    ? tables.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : tables;

  // Coverage stats
  const totalTables = tables.length;
  const describedTables = tables.filter((t) => descriptions.has(t.name)).length;
  const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0);
  const describedCols = tables.reduce(
    (sum, t) =>
      sum +
      t.columns.filter((c) =>
        descriptions.has(`${t.name}.${c.column_name}`),
      ).length,
    0,
  );
  const overallProgress =
    totalTables + totalCols > 0
      ? (describedTables + describedCols) / (totalTables + totalCols)
      : 0;

  // Build wizard queue: tables without descriptions first, then columns
  const wizardItems: WizardItem[] = [];
  for (const table of tables) {
    if (!descriptions.has(table.name)) {
      wizardItems.push({
        tableName: table.name,
        columnName: null,
        label: table.name,
        level: "table",
        rowCount: table.rowCount,
      });
    }
  }
  for (const table of tables) {
    for (const col of table.columns) {
      const key = `${table.name}.${col.column_name}`;
      if (!descriptions.has(key)) {
        wizardItems.push({
          tableName: table.name,
          columnName: col.column_name,
          label: `${table.name}.${col.column_name}`,
          level: "column",
          dataType: col.data_type,
          udtName: col.udt_name,
          isNullable: col.is_nullable,
          columnDefault: col.column_default,
          enumValues: col.enum_values,
          rowCount: table.rowCount,
        });
      }
    }
  }
  const hasUndescribed = wizardItems.length > 0;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#111] border-r border-white/10 flex-col">
        <div className="p-3">
          <Link
            href="/"
            className="w-full flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/5 transition"
          >
            <HoloLogo size="sm" />
          </Link>
        </div>
        <nav className="px-3 space-y-1 flex-1">
          <Link
            href="/"
            className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            {t("nav.queries")}
          </Link>
          <Link
            href="/invites"
            className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            {t("nav.invites")}
          </Link>
          {(user?.role === "admin" || user?.canSchedule) && (
            <Link
              href="/schedules"
              className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
            >
              {t("nav.schedules")}
            </Link>
          )}
          <Link
            href="/training"
            className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium"
          >
            {t("nav.training")}
          </Link>
          <Link
            href="/profile"
            className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            {t("nav.profile")}
          </Link>
        </nav>
        <div className="p-3 border-t border-white/10">
          <LangSwitcher />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0 lg:hidden">
          <Link
            href="/"
            className="text-white/40 hover:text-white transition text-sm"
          >
            &larr; {t("nav.back")}
          </Link>
          <h1 className="text-base font-semibold">{t("training.title")}</h1>
          <div className="flex items-center gap-2">
            {user?.isVip && (
              <svg width="16" height="16" viewBox="0 0 16 16" className="text-amber-400 vip-badge">
                <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
              </svg>
            )}
            <LangSwitcher />
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex flex-col animate-pulse">
            {/* Sticky search + stats skeleton */}
            <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 border-b border-white/5 px-3 sm:px-4 lg:px-6 py-3 space-y-3">
              <div className="max-w-4xl mx-auto">
                <div className="hidden lg:block mb-3 space-y-2">
                  <div className="h-6 w-40 rounded-lg bg-white/[0.06]" />
                  <div className="h-3 w-64 rounded-lg bg-white/[0.06]" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-9 rounded-lg bg-white/[0.06]" />
                  <div className="hidden sm:flex items-center gap-4">
                    <div className="h-3 w-24 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-28 rounded-lg bg-white/[0.06]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06]" />
                  <div className="h-2.5 w-8 rounded bg-white/[0.06]" />
                </div>
              </div>
            </div>
            {/* Table list skeleton */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
              <div className="max-w-4xl mx-auto space-y-2">
                {[120, 160, 100, 140, 180, 110, 150, 130].map((w, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 sm:px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-2.5 h-2.5 rounded-sm bg-white/[0.06]" />
                        <div className="h-4 rounded-lg bg-white/[0.06]" style={{ width: w }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="hidden sm:block w-16 h-1 rounded-full bg-white/[0.06]" />
                        <div className="h-3 w-8 rounded bg-white/[0.06]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Sticky search + stats bar */}
            <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/5 px-3 sm:px-4 lg:px-6 py-3 space-y-3">
              <div className="max-w-4xl mx-auto">
                {/* Title (desktop only, mobile has it in header) */}
                <div className="hidden lg:block mb-3">
                  <h1 className="text-xl font-bold">{t("training.title")}</h1>
                  <p className="text-white/40 text-sm mt-0.5">
                    {t("training.subtitle")}
                  </p>
                </div>

                {/* Search + inline stats */}
                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <circle cx="7" cy="7" r="5" />
                      <path d="M11 11l3.5 3.5" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("training.searchPlaceholder")}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition text-sm"
                    />
                  </div>

                  {/* Start Training button */}
                  {isAdmin && hasUndescribed && (
                    <button
                      onClick={() => setWizardOpen(true)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition shrink-0"
                    >
                      {t("training.startTraining")}
                    </button>
                  )}

                  {/* Compact stats */}
                  <div className="hidden sm:flex items-center gap-4 text-[11px] text-white/40 shrink-0">
                    <span>
                      <span className="text-white/70 font-medium">
                        {describedTables}
                      </span>
                      /{totalTables} {t("training.tables")}
                    </span>
                    <span>
                      <span className="text-white/70 font-medium">
                        {describedCols}
                      </span>
                      /{totalCols} {t("training.columns")}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/50 transition-all duration-500"
                      style={{ width: `${overallProgress * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/25 tabular-nums shrink-0">
                    {Math.round(overallProgress * 100)}%
                  </span>
                  {/* Mobile-only stats */}
                  <span className="sm:hidden text-[10px] text-white/25 shrink-0">
                    {describedTables + describedCols}/
                    {totalTables + totalCols}
                  </span>
                </div>

                {!isAdmin && (
                  <p className="text-amber-400/60 text-[11px] mt-2">
                    {t("training.adminOnly")}
                  </p>
                )}
              </div>
            </div>

            {/* Table list */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
              <div className="max-w-4xl mx-auto space-y-2">
                {filteredTables.length === 0 && search ? (
                  <div className="text-center py-12 text-white/25 text-sm">
                    No tables matching &quot;{search}&quot;
                  </div>
                ) : (
                  filteredTables.map((table) => (
                    <TableAccordion
                      key={table.name}
                      table={table}
                      descriptions={descriptions}
                      isAdmin={isAdmin}
                      onSave={handleSave}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Training Wizard overlay */}
      {wizardOpen && (
        <TrainingWizard
          items={wizardItems}
          tables={tables}
          descriptions={descriptions}
          onSave={handleSave}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
