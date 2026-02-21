"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";
import { HoloLogo } from "../holo-logo";

type Schedule = {
  id: number;
  question: string;
  sql: string;
  cron_expr: string;
  label: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

type UserInfo = {
  role: string;
  isVip?: boolean;
  canSchedule?: boolean;
  canTrain?: boolean;
};

const INTERVALS = [
  { value: "hourly", cron: "0 * * * *" },
  { value: "daily", cron: "0 9 * * *" },
  { value: "weekly", cron: "0 9 * * 1" },
  { value: "monthly", cron: "0 9 1 * *" },
] as const;

function cronLabel(cron: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    "0 * * * *": t("schedules.hourly"),
    "0 9 * * *": t("schedules.daily"),
    "0 9 * * 1": t("schedules.weekly"),
    "0 9 1 * *": t("schedules.monthly"),
  };
  return map[cron] || cron;
}

export default function SchedulesPage() {
  const { t } = useI18n();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [interval, setInterval] = useState("daily");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) { window.location.href = "/login"; return null; }
        return r.json();
      })
      .then((data) => { if (data?.user) setUser(data.user); })
      .catch(() => {});
    loadSchedules();
  }, []);

  function loadSchedules() {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((data) => {
        if (data.schedules) setSchedules(data.schedules);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (!question.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        return;
      }
      setQuestion("");
      loadSchedules();
    } catch {
      setError("Connection error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  const canAccess = user?.role === "admin" || user?.canSchedule;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#111] border-r border-white/10 flex-col">
        <div className="p-3">
          <Link href="/" className="w-full flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/5 transition">
            <HoloLogo size="sm" />
          </Link>
        </div>
        <nav className="px-3 space-y-1 flex-1">
          <Link href="/" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">{t("nav.queries")}</Link>
          <Link href="/invites" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">{t("nav.invites")}</Link>
          <Link href="/schedules" className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium">{t("nav.schedules")}</Link>
          {(user?.role === "admin" || user?.canTrain) && (
            <Link href="/training" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">{t("nav.training")}</Link>
          )}
          <Link href="/profile" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">{t("nav.profile")}</Link>
        </nav>
        <div className="p-3 border-t border-white/10"><LangSwitcher /></div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0 lg:hidden">
          <Link href="/" className="text-white/40 hover:text-white transition text-sm">&larr; {t("nav.back")}</Link>
          <h1 className="text-lg font-semibold">{t("schedules.title")}</h1>
          <LangSwitcher />
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {!canAccess && user ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/30">{t("schedules.noPermission")}</p>
            </div>
          ) : loading ? (
            <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
              <div className="h-6 w-40 rounded-lg bg-white/[0.06]" />
              <div className="h-3 w-64 rounded-lg bg-white/[0.06]" />
              <div className="h-12 rounded-xl bg-white/[0.06]" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2">
                  <div className="h-4 w-48 rounded-lg bg-white/[0.06]" />
                  <div className="h-3 w-24 rounded-lg bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header */}
              <div className="hidden lg:block">
                <h1 className="text-2xl font-bold">{t("schedules.title")}</h1>
                <p className="text-sm text-white/40 mt-1">{t("schedules.subtitle")}</p>
              </div>

              {/* Create form */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder={t("schedules.questionPlaceholder")}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
                  />
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                  >
                    {INTERVALS.map((i) => (
                      <option key={i.value} value={i.value} className="bg-[#111]">
                        {t(`schedules.${i.value}` as "schedules.hourly")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreate}
                    disabled={!question.trim() || creating}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                  >
                    {creating ? t("schedules.creating") : t("schedules.create")}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
                {creating && (
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <div className="animate-spin h-3 w-3 border border-blue-500/30 border-t-blue-400 rounded-full" />
                    {t("schedules.validating")}
                  </div>
                )}
              </div>

              {/* List */}
              {schedules.length === 0 ? (
                <div className="text-center py-12 text-white/30">
                  <p className="text-lg mb-2">{t("schedules.empty")}</p>
                  <p className="text-sm">{t("schedules.emptyHint")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((s) => (
                    <div key={s.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.question}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {cronLabel(s.cron_expr, t as (k: string) => string)}
                            </span>
                            <span>
                              {t("schedules.lastRun")}:{" "}
                              {s.last_run_at
                                ? new Date(s.last_run_at).toLocaleString("ru")
                                : t("schedules.never")}
                            </span>
                          </div>
                          {s.last_error && (
                            <p className="mt-2 text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg px-2 py-1 truncate">
                              {t("schedules.lastError")}: {s.last_error}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-xs text-red-400/50 hover:text-red-400 transition shrink-0 px-2 py-1 rounded-lg hover:bg-red-500/10"
                        >
                          {t("schedules.delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
