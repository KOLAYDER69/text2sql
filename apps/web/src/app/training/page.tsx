"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";

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

export default function TrainingPage() {
  const { t } = useI18n();
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [descriptions, setDescriptions] = useState<Map<string, string>>(new Map());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const isAdmin = user?.role === "admin";

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

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#111] border-r border-white/10 flex-col">
        <div className="p-3">
          <Link
            href="/"
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition text-sm font-medium"
          >
            <span className="text-lg leading-none">&larr;</span>
            QueryBot
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
          <LangSwitcher />
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
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

      <style jsx global>{`
        .animate-fade-out {
          animation: fadeOut 2s ease-in-out forwards;
        }
        @keyframes fadeOut {
          0%,
          70% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
