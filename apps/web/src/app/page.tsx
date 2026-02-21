"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useI18n, LangSwitcher } from "@/lib/i18n";
import { QueryChart } from "./chart";
import { HoloLogo } from "./holo-logo";

function formatAnalysis(text: string): string {
  // 1. Preserve safe HTML tags from AI (<b>, <i>, <code>) with placeholders
  const tags: string[] = [];
  let out = text.replace(/<\/?(b|i|code)>/gi, (match) => {
    tags.push(match);
    return `\x00${tags.length - 1}\x00`;
  });

  // 2. Escape remaining HTML
  out = out
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3. Restore safe tags, mapping to styled elements
  out = out.replace(/\x00(\d+)\x00/g, (_, idx) => {
    const tag = tags[Number(idx)];
    return tag
      .replace(/<b>/gi, '<strong class="text-white">')
      .replace(/<\/b>/gi, "</strong>")
      .replace(/<i>/gi, "<em>")
      .replace(/<\/i>/gi, "</em>")
      .replace(/<code>/gi, '<code class="bg-white/10 px-1 rounded text-blue-300">')
      .replace(/<\/code>/gi, "</code>");
  });

  // 4. Markdown fallbacks (in case AI uses markdown instead of HTML)
  out = out.replace(/^#{1,3}\s+(.+)$/gm, '<strong class="text-white block mt-3 mb-1">$1</strong>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
  out = out.replace(/__(.+?)__/g, '<strong class="text-white">$1</strong>');
  out = out.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1 rounded text-blue-300">$1</code>');

  // 5. Bullet points and paragraphs
  out = out.replace(/^[-—]\s+/gm, "• ");
  out = out.replace(/\n\n/g, '</p><p class="mt-2">');
  out = `<p>${out}</p>`;
  return out;
}

type ChartDataset = { label: string; data: number[] };
type ChartConfig = {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: ChartDataset[];
};

type QueryResult = {
  question: string;
  sql: string;
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
  executionMs: number;
  error?: string;
  analysis?: string;
  chart?: ChartConfig;
};

type ClarifyQuestion = { question: string; options: string[] };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  result?: QueryResult;
  clarification?: {
    questions: ClarifyQuestion[];
    answers: Record<number, string>;
    resolved: boolean;
    originalQuestion: string;
  };
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or loading changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  // Get the first assistant message with a result (the original query context)
  function getQueryContext(): QueryResult | undefined {
    return messages.find((m) => m.role === "assistant" && m.result)?.result;
  }

  async function runQuery(question: string) {
    if (!question.trim() || loading || clarifying) return;
    setInput("");
    setClarifying(true);

    const q = question.trim();

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: q }]);

    try {
      const res = await fetch("/api/query/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();

      if (data.skip || !data.questions || data.questions.length === 0) {
        // No clarification needed — execute immediately
        setClarifying(false);
        await executeQuery(q);
      } else {
        // Show clarification card
        setClarifying(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            clarification: {
              questions: data.questions,
              answers: {},
              resolved: false,
              originalQuestion: q,
            },
          },
        ]);
      }
    } catch {
      setClarifying(false);
      // Fail-safe: just execute without clarification
      await executeQuery(q);
    }
  }

  async function executeQuery(question: string) {
    setLoading(true);
    setLoadingStage(0);

    // Cycle through stages while waiting
    const stageTimer = setInterval(() => {
      setLoadingStage((s) => Math.min(s + 1, 2));
    }, 3000);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      const result: QueryResult = { ...data, question };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.analysis || result.error || "",
          result,
        },
      ]);
      loadHistory();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("main.connectionError"),
          result: {
            question,
            sql: "",
            rows: [],
            fields: [],
            rowCount: 0,
            executionMs: 0,
            error: t("main.connectionError"),
          },
        },
      ]);
    } finally {
      clearInterval(stageTimer);
      setLoading(false);
    }
  }

  function handleClarifyAnswer(msgIndex: number, questionIndex: number, option: string) {
    setMessages((prev) =>
      prev.map((msg, i) => {
        if (i !== msgIndex || !msg.clarification) return msg;
        return {
          ...msg,
          clarification: {
            ...msg.clarification,
            answers: { ...msg.clarification.answers, [questionIndex]: option },
          },
        };
      }),
    );
  }

  async function handleClarifyConfirm(msgIndex: number) {
    const msg = messages[msgIndex];
    if (!msg?.clarification) return;

    const { originalQuestion, questions, answers } = msg.clarification;

    // Build enriched question
    const context = questions
      .map((q, i) => (answers[i] ? `${q.question}: ${answers[i]}` : null))
      .filter(Boolean)
      .join(". ");
    const enriched = context
      ? `${originalQuestion}. Контекст: ${context}.`
      : originalQuestion;

    // Mark as resolved
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.clarification
          ? { ...m, clarification: { ...m.clarification, resolved: true } }
          : m,
      ),
    );

    await executeQuery(enriched);
  }

  async function handleClarifySkip(msgIndex: number) {
    const msg = messages[msgIndex];
    if (!msg?.clarification) return;

    // Mark as resolved
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.clarification
          ? { ...m, clarification: { ...m.clarification, resolved: true } }
          : m,
      ),
    );

    await executeQuery(msg.clarification.originalQuestion);
  }

  async function sendFollowUp(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setLoading(true);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: question.trim() }]);

    const ctx = getQueryContext();
    if (!ctx) return;

    // Build message history for the API (exclude the first user+assistant pair which is the original query)
    const chatHistory = messages
      .filter((m) => !m.result) // only text-only messages (follow-ups)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/query/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUp: question.trim(),
          messages: chatHistory,
          context: {
            question: ctx.question,
            sql: ctx.sql,
            rows: ctx.rows,
            fields: ctx.fields,
            rowCount: ctx.rowCount,
          },
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || data.error || "No response" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("main.connectionError") },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || clarifying) return;

    // If we already have a query context, this is a follow-up
    const hasContext = getQueryContext();
    if (hasContext) {
      sendFollowUp(input);
    } else {
      runQuery(input);
    }
  }

  function handleNewQuery() {
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function handleHistoryClick(item: HistoryItem) {
    setSidebarOpen(false);
    setMessages([]);
    runQuery(item.question);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function refreshSuggestions() {
    if (refreshingSuggestions) return;
    setRefreshingSuggestions(true);
    try {
      const res = await fetch("/api/suggestions/refresh", { method: "POST" });
      const data = await res.json();
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch {
      // ignore
    } finally {
      setRefreshingSuggestions(false);
    }
  }

  const defaultSuggestions = [
    t("suggestion.1"),
    t("suggestion.2"),
    t("suggestion.3"),
    t("suggestion.4"),
    t("suggestion.5"),
    t("suggestion.6"),
  ];

  const hasMessages = messages.length > 0;
  const showEmpty = !hasMessages && !loading;

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
          {user?.role === "admin" && (
            <Link
              href="/training"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M2 8h8M2 12h10" />
              </svg>
              {t("nav.training")}
            </Link>
          )}
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
            <HoloLogo size="sm" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div className="flex justify-center mt-4">
                  <button
                    onClick={refreshSuggestions}
                    disabled={refreshingSuggestions}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition disabled:opacity-40"
                  >
                    <svg
                      width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                      className={refreshingSuggestions ? "animate-spin" : ""}
                    >
                      <path d="M1.5 8a6.5 6.5 0 0 1 11.25-4.5M14.5 8a6.5 6.5 0 0 1-11.25 4.5" />
                      <path d="M13.5 1v3.5H10M2.5 15v-3.5H6" />
                    </svg>
                    {refreshingSuggestions ? t("main.refreshing") : t("main.refresh")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {hasMessages && (
            <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    /* User message — right-aligned bubble */
                    <div className="flex justify-end">
                      <div className="bg-blue-600 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ) : msg.clarification ? (
                    /* Clarification card */
                    msg.clarification.resolved ? (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                        <p className="text-xs text-amber-400/60 font-medium">
                          {t("main.clarification")}
                          {Object.keys(msg.clarification.answers).length === 0 && (
                            <span className="ml-2 text-white/30">— {t("main.skipped")}</span>
                          )}
                        </p>
                        {Object.keys(msg.clarification.answers).length > 0 && (
                          <p className="text-sm text-white/50 mt-1">
                            {msg.clarification.questions
                              .map((q, qi) =>
                                msg.clarification!.answers[qi]
                                  ? `${q.question} → ${msg.clarification!.answers[qi]}`
                                  : null,
                              )
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
                        <p className="text-xs text-amber-400/60 uppercase tracking-wider font-medium mb-3">
                          {t("main.clarification")}
                        </p>
                        <div className="space-y-4">
                          {msg.clarification.questions.map((q, qi) => (
                            <div key={qi}>
                              <p className="text-sm text-white/80 mb-2">{q.question}</p>
                              <div className="flex flex-wrap gap-2">
                                {q.options.map((opt) => (
                                  <button
                                    key={opt}
                                    onClick={() => handleClarifyAnswer(i, qi, opt)}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition ${
                                      msg.clarification!.answers[qi] === opt
                                        ? "bg-amber-500/20 border border-amber-500/40 text-amber-200"
                                        : "bg-white/5 border border-white/10 text-white/60 hover:border-white/25 hover:text-white"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => handleClarifyConfirm(i)}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 transition"
                          >
                            {t("main.confirm")}
                          </button>
                          <button
                            onClick={() => handleClarifySkip(i)}
                            className="px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition"
                          >
                            {t("main.skip")}
                          </button>
                        </div>
                      </div>
                    )
                  ) : msg.result ? (
                    /* Assistant message with full query result */
                    <div className="space-y-4">
                      {msg.result.error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                          {msg.result.error}
                        </div>
                      )}

                      {msg.result.analysis && (
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                          <p className="text-xs text-blue-400/60 uppercase tracking-wider font-medium mb-2">{t("main.analysis")}</p>
                          <div
                            className="text-sm text-white/80 leading-relaxed analysis-content"
                            dangerouslySetInnerHTML={{ __html: formatAnalysis(msg.result.analysis) }}
                          />
                        </div>
                      )}

                      {msg.result.rows && msg.result.rows.length > 0 && msg.result.fields && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                          <div className="px-4 py-2 border-b border-white/10">
                            <span className="text-xs text-white/40">
                              {msg.result.rowCount} {t("main.rows")} · {msg.result.executionMs}{t("main.ms")}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-white/10 bg-white/[0.02]">
                                  {msg.result.fields.map((f) => (
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
                                {msg.result.rows.map((row, ri) => (
                                  <tr
                                    key={ri}
                                    className={`
                                      border-b border-white/5 hover:bg-white/[0.04] transition
                                      ${ri % 2 === 1 ? "bg-white/[0.015]" : ""}
                                    `}
                                  >
                                    {msg.result!.fields.map((f) => (
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

                      {msg.result.chart && <QueryChart config={msg.result.chart} />}

                      {msg.result.sql && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs text-white/40 uppercase tracking-wider font-medium">SQL</span>
                          </div>
                          <pre className="p-4 text-sm font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                            {msg.result.sql}
                          </pre>
                        </div>
                      )}

                      {!msg.result.error && msg.result.rows && msg.result.rows.length === 0 && (
                        <div className="text-center text-white/30 py-8 text-sm">
                          {t("main.noResults")}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Assistant text-only message (follow-up answer) */
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                      <div
                        className="text-sm text-white/80 leading-relaxed analysis-content"
                        dangerouslySetInnerHTML={{ __html: formatAnalysis(msg.content) }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Clarifying indicator */}
              {clarifying && (
                <div className="flex items-center gap-3 py-4">
                  <div className="animate-spin h-4 w-4 border-2 border-amber-500/30 border-t-amber-400 rounded-full" />
                  <p className="text-white/40 text-sm">{t("main.clarifying")}</p>
                </div>
              )}

              {/* Loading indicator inside chat */}
              {loading && !getQueryContext() && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
                  <div className="text-center">
                    <p className="text-white/60 text-sm font-medium">
                      {loadingStage === 0 && t("main.stageSQL")}
                      {loadingStage === 1 && t("main.stageExecute")}
                      {loadingStage === 2 && t("main.stageAnalyze")}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 justify-center">
                      {[0, 1, 2].map((s) => (
                        <div key={s} className={`h-1 w-8 rounded-full transition-all duration-500 ${s <= loadingStage ? "bg-blue-500" : "bg-white/10"}`} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-up loading indicator */}
              {loading && getQueryContext() && (
                <div className="flex items-center gap-3 py-4">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
                  <p className="text-white/40 text-sm">{t("main.thinking")}</p>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}

          {/* Initial loading (no messages yet) */}
          {loading && !hasMessages && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin h-6 w-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
                <div className="text-center">
                  <p className="text-white/60 text-sm font-medium">
                    {loadingStage === 0 && t("main.stageSQL")}
                    {loadingStage === 1 && t("main.stageExecute")}
                    {loadingStage === 2 && t("main.stageAnalyze")}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 justify-center">
                    {[0, 1, 2].map((s) => (
                      <div key={s} className={`h-1 w-8 rounded-full transition-all duration-500 ${s <= loadingStage ? "bg-blue-500" : "bg-white/10"}`} />
                    ))}
                  </div>
                </div>
              </div>
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
              placeholder={hasMessages ? t("main.followUp") : t("main.placeholder")}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition text-sm"
              disabled={loading || clarifying}
            />
            <button
              type="submit"
              disabled={loading || clarifying || !input.trim()}
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
