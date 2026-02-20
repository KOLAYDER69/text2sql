"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";

type UserInfo = {
  id: number;
  firstName: string;
  username: string | null;
  role: string;
};

type HistoryItem = {
  id: number;
  question: string;
  sql: string;
  row_count: number | null;
  execution_ms: number | null;
  error: string | null;
  platform: string;
  created_at: string;
};

export default function ProfilePage() {
  const { t } = useI18n();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return r.json();
      }),
      fetch("/api/history?limit=100").then((r) => r.json()),
    ])
      .then(([meData, histData]) => {
        if (meData?.user) setUser(meData.user);
        if (histData?.history) setHistory(histData.history);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const totalQueries = history.length;
  const successQueries = history.filter((h) => !h.error).length;
  const errorQueries = history.filter((h) => h.error).length;
  const webQueries = history.filter((h) => h.platform === "web").length;
  const tgQueries = history.filter((h) => h.platform === "telegram").length;
  const avgTime =
    successQueries > 0
      ? Math.round(
          history
            .filter((h) => !h.error && h.execution_ms)
            .reduce((sum, h) => sum + (h.execution_ms ?? 0), 0) / successQueries,
        )
      : 0;
  const totalRows = history
    .filter((h) => !h.error)
    .reduce((sum, h) => sum + (h.row_count ?? 0), 0);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const perDay = last7.map(
    (day) => history.filter((h) => h.created_at.slice(0, 10) === day).length,
  );
  const maxPerDay = Math.max(...perDay, 1);

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
            href="/profile"
            className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium"
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
          <Link href="/" className="text-white/40 hover:text-white transition text-sm">
            &larr; {t("nav.back")}
          </Link>
          <h1 className="text-lg font-semibold">{t("profile.title")}</h1>
          <LangSwitcher />
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* User card */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xl font-bold text-blue-400">
                      {user?.firstName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{user?.firstName}</h2>
                      {user?.username && (
                        <p className="text-white/40 text-sm">@{user.username}</p>
                      )}
                      <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                        {user?.role}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition text-sm"
                  >
                    {t("nav.logout")}
                  </button>
                </div>
              </div>

              {/* Stats grid */}
              <div>
                <h3 className="text-sm text-white/40 uppercase tracking-wider font-medium mb-3">
                  {t("profile.stats")}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <p className="text-2xl font-bold">{totalQueries}</p>
                    <p className="text-xs text-white/40 mt-1">{t("profile.totalQueries")}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <p className="text-2xl font-bold text-emerald-400">{successQueries}</p>
                    <p className="text-xs text-white/40 mt-1">{t("profile.successful")}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <p className="text-2xl font-bold text-red-400">{errorQueries}</p>
                    <p className="text-xs text-white/40 mt-1">{t("profile.errors")}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <p className="text-2xl font-bold">{avgTime}<span className="text-sm text-white/30">{t("main.ms")}</span></p>
                    <p className="text-xs text-white/40 mt-1">{t("profile.avgTime")}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <p className="text-2xl font-bold">{totalRows.toLocaleString()}</p>
                    <p className="text-xs text-white/40 mt-1">{t("profile.totalRows")}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-bold">{webQueries}</p>
                      <span className="text-white/20 text-xs">/</span>
                      <p className="text-lg font-bold text-blue-400">{tgQueries}</p>
                    </div>
                    <p className="text-xs text-white/40 mt-1">{t("profile.webTelegram")}</p>
                  </div>
                </div>
              </div>

              {/* Activity chart */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <h3 className="text-sm text-white/40 uppercase tracking-wider font-medium mb-4">
                  {t("profile.activity")}
                </h3>
                <div className="flex items-end gap-1.5 h-24">
                  {last7.map((day, i) => (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
                        <div
                          className="w-full max-w-[32px] bg-blue-500/40 rounded-t transition-all"
                          style={{
                            height: `${Math.max((perDay[i] / maxPerDay) * 100, perDay[i] > 0 ? 8 : 0)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-white/25">
                        {new Date(day).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="flex gap-3">
                <Link
                  href="/"
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/[0.06] transition text-center"
                >
                  <p className="text-sm font-medium">{t("nav.queries")}</p>
                  <p className="text-xs text-white/30 mt-1">{t("profile.askQuestion")}</p>
                </Link>
                <Link
                  href="/invites"
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/[0.06] transition text-center"
                >
                  <p className="text-sm font-medium">{t("nav.invites")}</p>
                  <p className="text-xs text-white/30 mt-1">{t("profile.manageAccess")}</p>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
