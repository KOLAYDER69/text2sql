"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";

type QueryResult = {
  question: string;
  sql: string;
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
  executionMs: number;
  error?: string;
};

type HistoryItem = {
  id: number;
  question: string;
  sql: string;
  row_count: number | null;
  execution_ms: number | null;
  error: string | null;
  created_at: string;
};

type UserInfo = {
  firstName: string;
  username: string | null;
  role: string;
};

export default function Home() {
  const { t } = useI18n();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});

    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((data) => {
        if (data.suggestions) setSuggestions(data.suggestions);
      })
      .catch(() => {});

    loadHistory();
  }, []);

  function loadHistory() {
    fetch("/api/history?limit=50")
      .then((r) => r.json())
      .then((data) => {
        if (data.history) setHistory(data.history);
      })
      .catch(() => {});
  }

  async function runQuery(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      setResult({ ...data, question: question.trim() });
      loadHistory();
    } catch {
      setResult({
        question: question.trim(),
        sql: "",
        rows: [],
        fields: [],
        rowCount: 0,
        executionMs: 0,
        error: t("main.connectionError"),
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runQuery(input);
  }

  function handleNewQuery() {
    setResult(null);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function handleHistoryClick(item: HistoryItem) {
    setSidebarOpen(false);
    runQuery(item.question);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const defaultSuggestions = [
    t("suggestion.1"),
    t("suggestion.2"),
    t("suggestion.3"),
    t("suggestion.4"),
  ];

  const showEmpty = !result && !loading;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-64 bg-[#111] border-r border-white/10
          flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* New query button */}
        <div className="p-3">
          <button
            onClick={handleNewQuery}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition text-sm font-medium"
          >
            <span className="text-lg leading-none">+</span>
            {t("nav.newQuery")}
          </button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-2">
          <p className="text-xs text-white/30 px-2 py-2 uppercase tracking-wider">
            {t("nav.history")}
          </p>
          {history.length === 0 ? (
            <p className="text-white/20 text-xs px-2">{t("main.noHistory")}</p>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => handleHistoryClick(item)}
                className="w-full text-left px-2 py-2 rounded-md hover:bg-white/5 transition group mb-0.5"
              >
                <p className="text-sm truncate text-white/70 group-hover:text-white transition">
                  {item.question}
                </p>
                <p className="text-[11px] text-white/25 mt-0.5">
                  {item.error
                    ? t("main.error")
                    : `${item.row_count} ${t("main.rows")}`}
                  {" · "}
                  {new Date(item.created_at).toLocaleDateString("ru")}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Bottom nav */}
        <div className="border-t border-white/10 p-2 space-y-0.5">
          <Link
            href="/invites"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            {t("nav.invites")}
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
            </svg>
            {t("nav.profile")}
          </Link>
          <div className="px-3 py-2">
            <LangSwitcher />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white/40 hover:text-white transition lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">QueryBot</h1>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                className="text-sm text-white/50 hover:text-white transition"
              >
                {user.username ? `@${user.username}` : user.firstName}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-white/30 hover:text-white transition"
              >
                {t("nav.logout")}
              </button>
            </div>
          )}
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Empty state — suggestions */}
          {showEmpty && (
            <div className="flex items-center justify-center h-full p-4">
              <div className="max-w-2xl w-full">
                <h2 className="text-2xl font-bold text-center mb-2">
                  {t("main.title")}
                </h2>
                <p className="text-white/40 text-center mb-8 text-sm">
                  {t("main.subtitle")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(suggestions.length > 0 ? suggestions : defaultSuggestions).map((q) => (
                    <button
                      key={q}
                      onClick={() => runQuery(q)}
                      className="text-left px-4 py-3 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/5 transition text-sm text-white/60 hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-white/50">
                <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
                {t("main.running")}
              </div>
            </div>
          )}

          {/* Query result */}
          {result && !loading && (
            <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
              <div className="text-white/50 text-sm">
                {result.question}
              </div>

              {result.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                  {result.error}
                </div>
              )}

              {result.sql && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                    <span className="text-xs text-white/40 uppercase tracking-wider font-medium">SQL</span>
                  </div>
                  <pre className="p-4 text-sm font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {result.sql}
                  </pre>
                </div>
              )}

              {result.rows && result.rows.length > 0 && result.fields && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/10">
                    <span className="text-xs text-white/40">
                      {result.rowCount} {t("main.rows")} · {result.executionMs}{t("main.ms")}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02]">
                          {result.fields.map((f) => (
                            <th
                              key={f}
                              className="text-left px-4 py-2.5 text-white/50 font-medium text-xs uppercase tracking-wider whitespace-nowrap sticky top-0 bg-[#111]"
                            >
                              {f}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr
                            key={ri}
                            className={`
                              border-b border-white/5 hover:bg-white/[0.04] transition
                              ${ri % 2 === 1 ? "bg-white/[0.015]" : ""}
                            `}
                          >
                            {result.fields.map((f) => (
                              <td
                                key={f}
                                className="px-4 py-2 font-mono text-sm whitespace-nowrap"
                              >
                                {String(row[f] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!result.error && result.rows && result.rows.length === 0 && (
                <div className="text-center text-white/30 py-8 text-sm">
                  {t("main.noResults")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input — fixed at bottom */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 shrink-0">
          <div className="flex gap-2 max-w-5xl mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("main.placeholder")}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3 rounded-xl font-medium transition text-sm"
            >
              {t("main.send")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
