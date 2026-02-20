"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";

type Invite = {
  id: number;
  code: string;
  created_by: number;
  used_by: number | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export default function InvitesPage() {
  const { t } = useI18n();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [newInvite, setNewInvite] = useState<{ code: string; deepLink: string } | null>(null);

  const botName = "leadsaibot";

  useEffect(() => {
    loadInvites();
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
          <Link href="/invites" className="block px-3 py-2 rounded-lg text-sm text-white bg-white/5 font-medium">
            {t("nav.invites")}
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
          <h1 className="text-lg font-semibold">{t("invites.title")}</h1>
          <LangSwitcher />
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
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
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
          </div>
        </div>
      </div>
    </div>
  );
}
