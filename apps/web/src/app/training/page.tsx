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
      className={`text-xs transition-opacity duration-500 ${
        state === "saving" ? "text-blue-400 opacity-100" : "text-emerald-400 opacity-100 animate-fade-out"
      }`}
    >
      {state === "saving" ? t("training.saving") : t("training.saved")}
    </span>
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
  const describedCols = table.columns.filter((c) => descriptions.has(`${table.name}.${c.column_name}`)).length;

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

    // Clear "saved" after 2s
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
      {/* Table header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className={`text-white/30 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-sm font-medium">{table.name}</span>
          {table.rowCount != null && table.rowCount > 0 && (
            <span className="text-xs text-white/20">~{table.rowCount.toLocaleString()}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {tableDesc && (
            <span className="text-xs text-emerald-400/60 hidden sm:inline">
              {tableDesc.length > 40 ? tableDesc.slice(0, 37) + "..." : tableDesc}
            </span>
          )}
          <span className="text-xs text-white/25">
            {describedCols}/{table.columns.length} {t("training.columns")}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/10">
          {/* Table-level description */}
          <div className="px-4 py-3 bg-white/[0.02] flex items-center gap-3">
            <DescriptionInput
              placeholder={t("training.tablePlaceholder")}
              defaultValue={tableDesc}
              disabled={!isAdmin}
              onSave={(desc) => handleSave(null, desc)}
            />
            <SaveIndicator state={tableSaveState} />
          </div>

          {/* Column rows */}
          {table.columns.map((col) => {
            const colKey = `${table.name}.${col.column_name}`;
            const colDesc = descriptions.get(colKey) ?? "";
            const typeName = col.data_type === "USER-DEFINED" ? col.udt_name : col.data_type;
            const saveKey = col.column_name;

            return (
              <div
                key={col.column_name}
                className="px-4 py-2.5 border-t border-white/5 flex items-center gap-3"
              >
                <div className="w-48 shrink-0">
                  <span className="font-mono text-xs text-white/70">{col.column_name}</span>
                  <span className="text-xs text-white/20 ml-2">{typeName}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <DescriptionInput
                    placeholder={t("training.columnPlaceholder")}
                    defaultValue={colDesc}
                    disabled={!isAdmin}
                    onSave={(desc) => handleSave(col.column_name, desc)}
                    small
                  />
                </div>
                <SaveIndicator state={colSaveStates[saveKey] ?? "idle"} />
              </div>
            );
          })}
        </div>
      )}
    </div>
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

  // Sync with external changes
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
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-transparent border-b border-white/10 focus:border-blue-500/50 outline-none transition text-white/70 placeholder:text-white/15 disabled:opacity-40 disabled:cursor-not-allowed ${
        small ? "text-xs py-0.5" : "text-sm py-1"
      }`}
    />
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
            const key = d.column_name ? `${d.table_name}.${d.column_name}` : d.table_name;
            map.set(key, d.description);
          }
          setDescriptions(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(tableName: string, columnName: string | null, description: string) {
    try {
      await fetch("/api/schema/descriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_name: tableName, column_name: columnName, description }),
      });

      // Update local state
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
    ? tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables;

  // Coverage stats
  const totalTables = tables.length;
  const describedTables = tables.filter((t) => descriptions.has(t.name)).length;
  const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0);
  const describedCols = tables.reduce(
    (sum, t) => sum + t.columns.filter((c) => descriptions.has(`${t.name}.${c.column_name}`)).length,
    0,
  );

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
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
          <Link href="/" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.queries")}
          </Link>
          <Link href="/invites" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.invites")}
          </Link>
          <Link href="/training" className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium">
            {t("nav.training")}
          </Link>
          <Link href="/profile" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
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
          <Link href="/" className="text-white/40 hover:text-white transition text-sm">
            &larr; {t("nav.back")}
          </Link>
          <h1 className="text-lg font-semibold">{t("training.title")}</h1>
          <LangSwitcher />
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold">{t("training.title")}</h1>
                <p className="text-white/40 text-sm mt-1">{t("training.subtitle")}</p>
                {!isAdmin && (
                  <p className="text-amber-400/60 text-xs mt-2">{t("training.adminOnly")}</p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <p className="text-2xl font-bold">
                    {describedTables}<span className="text-sm text-white/30">/{totalTables}</span>
                  </p>
                  <p className="text-xs text-white/40 mt-1">{t("training.tables")} {t("training.described")}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <p className="text-2xl font-bold">
                    {describedCols}<span className="text-sm text-white/30">/{totalCols}</span>
                  </p>
                  <p className="text-xs text-white/40 mt-1">{t("training.columns")} {t("training.described")}</p>
                </div>
              </div>

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("training.searchPlaceholder")}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition text-sm"
              />

              {/* Table accordion list */}
              <div className="space-y-2">
                {filteredTables.map((table) => (
                  <TableAccordion
                    key={table.name}
                    table={table}
                    descriptions={descriptions}
                    isAdmin={isAdmin}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .animate-fade-out {
          animation: fadeOut 2s ease-in-out forwards;
        }
        @keyframes fadeOut {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
