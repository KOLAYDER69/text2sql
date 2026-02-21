"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";
import { HoloLogo } from "../holo-logo";

type UserInfo = {
  id: number;
  firstName: string;
  username: string | null;
  role: string;
  isVip: boolean;
  canQuery: boolean;
  canInvite: boolean;
  canTrain: boolean;
  canSchedule: boolean;
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
          {(user?.role === "admin" || user?.canTrain) && (
            <Link
              href="/training"
              className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
            >
              {t("nav.training")}
            </Link>
          )}
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
          <div className="flex items-center gap-2">
            {user?.isVip && (
              <svg width="16" height="16" viewBox="0 0 16 16" className="text-amber-400 vip-badge">
                <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
              </svg>
            )}
            <LangSwitcher />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
              {/* User card skeleton */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white/[0.06]" />
                    <div className="space-y-2">
                      <div className="h-5 w-32 rounded-lg bg-white/[0.06]" />
                      <div className="h-3 w-20 rounded-lg bg-white/[0.06]" />
                      <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
                    </div>
                  </div>
                  <div className="h-9 w-20 rounded-xl bg-white/[0.06]" />
                </div>
              </div>
              {/* Permissions skeleton */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <div className="h-3 w-28 rounded-lg bg-white/[0.06] mb-3" />
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-white/[0.06]" />
                  ))}
                </div>
              </div>
              {/* Stats skeleton */}
              <div>
                <div className="h-3 w-20 rounded-lg bg-white/[0.06] mb-3" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2">
                      <div className="h-7 w-12 rounded-lg bg-white/[0.06]" />
                      <div className="h-3 w-16 rounded-lg bg-white/[0.06]" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Activity chart skeleton */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <div className="h-3 w-24 rounded-lg bg-white/[0.06] mb-4" />
                <div className="flex items-end gap-1.5 h-24">
                  {[40, 65, 30, 80, 55, 45, 70].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
                        <div className="w-full max-w-[32px] rounded-t bg-white/[0.06]" style={{ height: `${h}%` }} />
                      </div>
                      <div className="h-2 w-8 rounded bg-white/[0.06]" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Quick links skeleton */}
              <div className="flex gap-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="h-4 w-20 rounded-lg bg-white/[0.06] mx-auto" />
                    <div className="h-3 w-28 rounded-lg bg-white/[0.06] mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* User card */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                      user?.isVip
                        ? "bg-amber-500/20 border border-amber-500/30 text-amber-400"
                        : "bg-blue-600/20 border border-blue-500/30 text-blue-400"
                    }`}>
                      {user?.firstName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold">{user?.firstName}</h2>
                        {user?.isVip && (
                          <svg width="18" height="18" viewBox="0 0 16 16" className="text-amber-400 vip-badge">
                            <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
                          </svg>
                        )}
                      </div>
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

              {/* Permissions card */}
              {user && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm text-white/40 uppercase tracking-wider font-medium mb-3">
                    {t("perm.title")}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {([
                      { key: "canQuery" as const, label: t("perm.query"), icon: "Q" },
                      { key: "canInvite" as const, label: t("perm.invite"), icon: "I" },
                      { key: "canTrain" as const, label: t("perm.train"), icon: "T" },
                      { key: "canSchedule" as const, label: t("perm.schedule"), icon: "S" },
                      { key: "isVip" as const, label: t("perm.vip"), icon: "\u2605" },
                    ] as const).map(({ key, label, icon }) => {
                      const granted = user[key];
                      const isVipPerm = key === "isVip";
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
                            granted
                              ? isVipPerm
                                ? "bg-amber-500/5 border-amber-500/20"
                                : "bg-emerald-500/5 border-emerald-500/20"
                              : "bg-white/[0.02] border-white/5"
                          }`}
                        >
                          <span className={`text-sm font-bold ${
                            granted
                              ? isVipPerm ? "text-amber-400" : "text-emerald-400"
                              : "text-white/15"
                          }`}>
                            {icon}
                          </span>
                          <span className={`text-xs ${granted ? "text-white/60" : "text-white/20"}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
