"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";
import { HoloLogo } from "../holo-logo";

type Invite = {
  id: number;
  code: string;
  created_by: number;
  used_by: number | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type InvitedUser = {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
  isVip: boolean;
  canQuery: boolean;
  canInvite: boolean;
  canTrain: boolean;
  canSchedule: boolean;
  createdAt: string;
  lastSeenAt: string;
};

function PermToggle({
  checked,
  onChange,
  label,
  golden,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  golden?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 group"
      title={label}
    >
      <div
        className={`w-7 h-4 rounded-full transition-colors relative ${
          checked
            ? golden
              ? "bg-amber-500/60"
              : "bg-emerald-500/60"
            : "bg-white/10"
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
            checked
              ? golden
                ? "left-3.5 bg-amber-300"
                : "left-3.5 bg-emerald-300"
              : "left-0.5 bg-white/40"
          }`}
        />
      </div>
      <span className={`text-[10px] ${
        checked
          ? golden ? "text-amber-300/70" : "text-white/50"
          : "text-white/20"
      }`}>
        {label}
      </span>
    </button>
  );
}

export default function InvitesPage() {
  const { t } = useI18n();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<InvitedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [newInvite, setNewInvite] = useState<{ code: string; deepLink: string } | null>(null);
  const [userVip, setUserVip] = useState(false);
  const [userCanTrain, setUserCanTrain] = useState(false);
  const [userRole, setUserRole] = useState("");

  const botName = "leadsaibot";

  useEffect(() => {
    loadInvites();
    loadInvitedUsers();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user?.isVip) setUserVip(true);
        if (data?.user?.canTrain) setUserCanTrain(true);
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  function loadInvites() {
    fetch("/api/invites")
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.invites) setInvites(data.invites);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function loadInvitedUsers() {
    fetch("/api/users/invited")
      .then((r) => r.json())
      .then((data) => {
        if (data?.users) setInvitedUsers(data.users);
      })
      .catch(() => {});
  }

  async function updatePermission(
    userId: number,
    field: keyof Pick<InvitedUser, "isVip" | "canQuery" | "canInvite" | "canTrain" | "canSchedule">,
    value: boolean,
  ) {
    // Optimistic update
    setInvitedUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u)),
    );

    const user = invitedUsers.find((u) => u.id === userId);
    if (!user) return;

    const perms = {
      is_vip: field === "isVip" ? value : user.isVip,
      can_query: field === "canQuery" ? value : user.canQuery,
      can_invite: field === "canInvite" ? value : user.canInvite,
      can_train: field === "canTrain" ? value : user.canTrain,
      can_schedule: field === "canSchedule" ? value : user.canSchedule,
    };

    try {
      await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perms),
      });
    } catch {
      // Revert on error
      setInvitedUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, [field]: !value } : u)),
      );
    }
  }

  async function createInvite() {
    setCreating(true);
    setNewInvite(null);
    try {
      const res = await fetch("/api/invites", { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setNewInvite({ code: data.code, deepLink: data.deepLink });
      loadInvites();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  function copyText(text: string, id: number) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getDeepLink(code: string) {
    return `https://t.me/${botName}?start=${code}`;
  }

  const total = invites.length;
  const used = invites.filter((i) => i.used_by !== null).length;
  const active = invites.filter(
    (i) => i.used_by === null && (!i.expires_at || new Date(i.expires_at) > new Date()),
  ).length;
  const expired = total - used - active;

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
          <Link href="/" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.queries")}
          </Link>
          <Link href="/invites" className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium">
            {t("nav.invites")}
          </Link>
          {(userRole === "admin" || userCanTrain) && (
            <Link href="/training" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
              {t("nav.training")}
            </Link>
          )}
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
          <h1 className="text-lg font-semibold">{t("invites.title")}</h1>
          <div className="flex items-center gap-2">
            {userVip && (
              <svg width="16" height="16" viewBox="0 0 16 16" className="text-amber-400 vip-badge">
                <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
              </svg>
            )}
            <LangSwitcher />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{t("invites.title")}</h1>
                <p className="text-white/40 text-sm mt-1">{t("invites.subtitle")}</p>
              </div>
              <button
                onClick={createInvite}
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2.5 rounded-xl font-medium transition text-sm"
              >
                {creating ? t("invites.creating") : t("invites.create")}
              </button>
            </div>

            {/* New invite card */}
            {newInvite && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-sm font-medium text-emerald-400">{t("invites.newReady")}</p>
                </div>

                {/* Deep link */}
                <div>
                  <p className="text-xs text-white/40 mb-1.5">{t("invites.linkLabel")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white/80 truncate">
                      {newInvite.deepLink}
                    </code>
                    <button
                      onClick={() => copyText(newInvite.deepLink, -1)}
                      className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition shrink-0"
                    >
                      {copiedId === -1 ? t("invites.copied") : t("invites.copy")}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-white/30">{t("invites.howItWorks")}</p>

                <button
                  onClick={() => setNewInvite(null)}
                  className="text-xs text-white/30 hover:text-white/50 transition"
                >
                  {t("invites.dismiss")}
                </button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-white/40 mt-1">{t("invites.total")}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <p className="text-2xl font-bold text-emerald-400">{active}</p>
                <p className="text-xs text-white/40 mt-1">{t("invites.active")}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <p className="text-2xl font-bold text-blue-400">{used}</p>
                <p className="text-xs text-white/40 mt-1">{t("invites.used")}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <p className="text-2xl font-bold text-white/30">{expired}</p>
                <p className="text-xs text-white/40 mt-1">{t("invites.expired")}</p>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="animate-pulse space-y-6">
                {/* Table skeleton */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex gap-4 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
                    <div className="h-3 w-16 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-14 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-20 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-20 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-12 rounded-lg bg-white/[0.06] ml-auto" />
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-white/5">
                      <div className="h-4 w-20 rounded-lg bg-white/[0.06]" />
                      <div className="h-5 w-14 rounded-full bg-white/[0.06]" />
                      <div className="h-4 w-20 rounded-lg bg-white/[0.06]" />
                      <div className="h-4 w-20 rounded-lg bg-white/[0.06]" />
                      <div className="h-3 w-16 rounded-lg bg-white/[0.06] ml-auto" />
                    </div>
                  ))}
                </div>
                {/* Invited users skeleton */}
                <div className="space-y-3">
                  <div className="h-5 w-32 rounded-lg bg-white/[0.06]" />
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/[0.06] shrink-0" />
                        <div className="space-y-1.5 flex-1">
                          <div className="h-4 w-28 rounded-lg bg-white/[0.06]" />
                          <div className="h-2.5 w-16 rounded-lg bg-white/[0.06]" />
                        </div>
                        <div className="h-5 w-14 rounded-full bg-white/[0.06]" />
                      </div>
                      <div className="flex gap-4 mt-3 pt-3 border-t border-white/5">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <div key={j} className="h-4 w-12 rounded-lg bg-white/[0.06]" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : invites.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <p className="text-lg mb-2">{t("invites.empty")}</p>
                <p className="text-sm">{t("invites.emptyHint")}</p>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02]">
                        <th className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider">{t("invites.colCode")}</th>
                        <th className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider">{t("invites.colStatus")}</th>
                        <th className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider">{t("invites.colCreated")}</th>
                        <th className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider">{t("invites.colExpires")}</th>
                        <th className="text-right px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider">{t("invites.colLink")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((invite, i) => {
                        const isUsed = invite.used_by !== null;
                        const isExpired =
                          !isUsed && invite.expires_at && new Date(invite.expires_at) < new Date();
                        const link = getDeepLink(invite.code);

                        return (
                          <tr
                            key={invite.id}
                            className={`
                              border-b border-white/5 hover:bg-white/[0.04] transition
                              ${i % 2 === 1 ? "bg-white/[0.015]" : ""}
                            `}
                          >
                            <td className="px-4 py-3 font-mono">{invite.code}</td>
                            <td className="px-4 py-3">
                              {isUsed ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {t("invites.statusUsed")}
                                </span>
                              ) : isExpired ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/30 border border-white/10">
                                  {t("invites.statusExpired")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {t("invites.statusActive")}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-white/50">
                              {new Date(invite.created_at).toLocaleDateString("ru")}
                            </td>
                            <td className="px-4 py-3 text-white/50">
                              {invite.expires_at
                                ? new Date(invite.expires_at).toLocaleDateString("ru")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!isUsed && !isExpired ? (
                                <button
                                  onClick={() => copyText(link, invite.id)}
                                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                                >
                                  {copiedId === invite.id ? t("invites.copied") : t("invites.copyLink")}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* My Users section */}
            {invitedUsers.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold">{t("users.title")}</h2>
                <div className="space-y-2">
                  {invitedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="bg-white/[0.03] border border-white/10 rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* User info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                            user.isVip
                              ? "bg-amber-500/20 border border-amber-500/30 text-amber-400"
                              : "bg-blue-600/20 border border-blue-500/30 text-blue-400"
                          }`}>
                            {user.firstName?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {user.firstName}
                                {user.lastName ? ` ${user.lastName}` : ""}
                              </span>
                              {user.isVip && (
                                <svg width="14" height="14" viewBox="0 0 16 16" className="text-amber-400 vip-badge shrink-0">
                                  <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
                                </svg>
                              )}
                            </div>
                            {user.username && (
                              <p className="text-xs text-white/30">@{user.username}</p>
                            )}
                            <p className="text-[10px] text-white/20 mt-0.5">
                              {t("users.colJoined")}: {new Date(user.createdAt).toLocaleDateString("ru")}
                              {" · "}
                              {t("users.lastSeen")}: {new Date(user.lastSeenAt).toLocaleDateString("ru")}
                            </p>
                          </div>
                        </div>

                        {/* Role badge */}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize shrink-0">
                          {user.role}
                        </span>
                      </div>

                      {/* Permission toggles */}
                      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-white/5">
                        <PermToggle
                          checked={user.canQuery}
                          onChange={(v) => updatePermission(user.id, "canQuery", v)}
                          label={t("perm.query")}
                        />
                        <PermToggle
                          checked={user.canInvite}
                          onChange={(v) => updatePermission(user.id, "canInvite", v)}
                          label={t("perm.invite")}
                        />
                        <PermToggle
                          checked={user.canTrain}
                          onChange={(v) => updatePermission(user.id, "canTrain", v)}
                          label={t("perm.train")}
                        />
                        <PermToggle
                          checked={user.canSchedule}
                          onChange={(v) => updatePermission(user.id, "canSchedule", v)}
                          label={t("perm.schedule")}
                        />
                        <PermToggle
                          checked={user.isVip}
                          onChange={(v) => updatePermission(user.id, "isVip", v)}
                          label={t("perm.vip")}
                          golden
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
