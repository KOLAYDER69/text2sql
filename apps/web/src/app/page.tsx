"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  historyId?: number;
};

type TeamChatMessage = {
  id: number;
  userId: number;
  username: string | null;
  firstName: string;
  message: string;
  sharePreview: { historyId: number; question: string; analysisSnippet: string } | null;
  createdAt: string;
};

type OnlineUser = {
  id: number;
  username: string | null;
  firstName: string;
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

type FavoriteItem = {
  id: number;
  question: string;
  sql: string;
  created_at: string;
};

type UserInfo = {
  id?: number;
  firstName: string;
  username: string | null;
  role: string;
  isVip?: boolean;
  canTrain?: boolean;
  canSchedule?: boolean;
  hasSeenOnboarding?: boolean;
};

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [generalSuggestions, setGeneralSuggestions] = useState<string[]>([]);
  const [personalSuggestions, setPersonalSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [fixSuggestion, setFixSuggestion] = useState<{ suggestion: string; fixedSql?: string } | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState<string | null>(null);
  const [shareModalLoading, setShareModalLoading] = useState(false);
  const [shareModalCopied, setShareModalCopied] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<{ id: number; username: string | null; firstName: string; lastName: string | null }[]>([]);
  const [notifySending, setNotifySending] = useState<number | null>(null);
  const [notifiedUsers, setNotifiedUsers] = useState<Set<number>>(new Set());
  // Chat panel state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<TeamChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  // Onboarding
  const [onboardingStep, setOnboardingStep] = useState(-1); // -1 = not showing
  // History loading
  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPanelEndRef = useRef<HTMLDivElement>(null);
  const lastChatFetchRef = useRef<string | null>(null);

  // Auto-scroll to bottom when messages change or loading changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-scroll chat panel
  useEffect(() => {
    chatPanelEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          // Show onboarding for new users
          if (data.user.hasSeenOnboarding === false) {
            setOnboardingStep(0);
          }
        }
      })
      .catch(() => {});

    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((data) => {
        if (data.general) setGeneralSuggestions(data.general);
        if (data.personal) setPersonalSuggestions(data.personal);
      })
      .catch(() => {});

    loadHistory();
    loadFavorites();

    // Handle ?load= deep link from Telegram bot
    const loadId = searchParams.get("load");
    if (loadId) {
      loadHistoryItem(parseInt(loadId, 10));
      // Clean URL
      window.history.replaceState({}, "", "/");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat polling — every 3 seconds when panel is open
  useEffect(() => {
    if (!chatOpen) return;

    function fetchChat() {
      const since = lastChatFetchRef.current;
      const url = since
        ? `/api/chat/messages?since=${encodeURIComponent(since)}`
        : "/api/chat/messages";

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (data.messages?.length > 0) {
            if (since) {
              setChatMessages((prev) => [...prev, ...data.messages]);
            } else {
              setChatMessages(data.messages);
            }
            const last = data.messages[data.messages.length - 1];
            lastChatFetchRef.current = last.createdAt;
          }
        })
        .catch(() => {});

      fetch("/api/chat/online")
        .then((r) => r.json())
        .then((data) => {
          if (data.users) setOnlineUsers(data.users);
        })
        .catch(() => {});
    }

    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [chatOpen]);

  function loadHistory() {
    fetch("/api/history?limit=50")
      .then((r) => r.json())
      .then((data) => {
        if (data.history) setHistory(data.history);
      })
      .catch(() => {});
  }

  function loadFavorites() {
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((data) => {
        if (data.favorites) setFavorites(data.favorites);
      })
      .catch(() => {});
  }

  async function toggleFavorite(question: string, sql: string) {
    const existing = favorites.find((f) => f.question === question);
    if (existing) {
      setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
      await fetch(`/api/favorites/${existing.id}`, { method: "DELETE" }).catch(() => {});
    } else {
      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, sql }),
        });
        const data = await res.json();
        if (data.favorite) setFavorites((prev) => [data.favorite, ...prev]);
      } catch { /* ignore */ }
    }
  }

  // Get the first assistant message with a result (the original query context)
  function getQueryContext(): QueryResult | undefined {
    return messages.find((m) => m.role === "assistant" && m.result)?.result;
  }

  async function runQuery(question: string) {
    if (!question.trim() || loading || clarifying) return;
    setInput("");
    setClarifying(true);
    setFixSuggestion(null);
    setFixLoading(false);
    setShowShareModal(false);
    setShareModalUrl(null);
    setNotifiedUsers(new Set());

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

  async function loadHistoryItem(id: number) {
    setLoadingHistoryId(id);
    setSidebarOpen(false);
    setMessages([]);
    setFixSuggestion(null);
    try {
      const res = await fetch(`/api/history/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      if (data.rows) {
        // Has saved results — display directly
        const result: QueryResult = {
          question: data.question,
          sql: data.sql,
          rows: data.rows,
          fields: data.fields || [],
          rowCount: data.rowCount || 0,
          executionMs: data.executionMs || 0,
          error: data.error,
          analysis: data.analysis,
          chart: data.chart,
          historyId: id,
        };
        setMessages([
          { role: "user", content: data.question },
          { role: "assistant", content: result.analysis || result.error || "", result },
        ]);
      } else {
        // Old history without saved results — show prompt
        setMessages([
          { role: "user", content: data.question },
          {
            role: "assistant",
            content: t("main.queryNotSaved"),
            result: {
              question: data.question,
              sql: data.sql,
              rows: [],
              fields: [],
              rowCount: 0,
              executionMs: 0,
              historyId: id,
            },
          },
        ]);
      }
    } catch {
      // Fallback: re-execute
      runQuery("...");
    } finally {
      setLoadingHistoryId(null);
    }
  }

  function handleHistoryClick(item: HistoryItem) {
    loadHistoryItem(item.id);
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
      if (data.suggestions) setGeneralSuggestions(data.suggestions);
    } catch {
      // ignore
    } finally {
      setRefreshingSuggestions(false);
    }
  }

  function copySQL(sql: string) {
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  }

  function downloadCSV(fields: string[], rows: Record<string, unknown>[]) {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv = [fields.map(esc).join(","), ...rows.map((r) => fields.map((f) => esc(r[f])).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    a.href = url;
    a.download = `query-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function requestFix(question: string, sql: string, error: string) {
    if (fixLoading) return;
    setFixLoading(true);
    setFixSuggestion(null);
    try {
      const res = await fetch("/api/query/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sql, error }),
      });
      const data = await res.json();
      if (data.suggestion) setFixSuggestion(data);
    } catch {
      // ignore
    } finally {
      setFixLoading(false);
    }
  }

  async function openShareModal() {
    const result = getQueryContext();
    if (!result || result.error || shareModalLoading) return;

    setShareModalLoading(true);
    setShowShareModal(true);
    setShareModalCopied(false);
    setUserSearch("");
    setUserSearchResults([]);
    setNotifiedUsers(new Set());

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: result.question,
          sql: result.sql,
          rows: result.rows,
          fields: result.fields,
          rowCount: result.rowCount,
          analysis: result.analysis,
          chart: result.chart,
        }),
      });
      const data = await res.json();
      if (data.url) {
        setShareModalUrl(data.url);
        navigator.clipboard.writeText(data.url);
        setShareModalCopied(true);
        setTimeout(() => setShareModalCopied(false), 2000);
      }
    } catch { /* ignore */ } finally {
      setShareModalLoading(false);
    }
  }

  function copyShareLink() {
    if (!shareModalUrl) return;
    navigator.clipboard.writeText(shareModalUrl);
    setShareModalCopied(true);
    setTimeout(() => setShareModalCopied(false), 2000);
  }

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUserSearch(q: string) {
    setUserSearch(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setUserSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.users) setUserSearchResults(data.users);
      } catch { /* ignore */ }
    }, 300);
  }

  async function notifyUser(userId: number) {
    const result = getQueryContext();
    if (!result || !shareModalUrl || notifySending !== null) return;
    setNotifySending(userId);
    try {
      const res = await fetch("/api/share/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareUrl: shareModalUrl,
          recipientId: userId,
          question: result.question,
        }),
      });
      if (res.ok) {
        setNotifiedUsers((prev) => new Set(prev).add(userId));
      }
    } catch { /* ignore */ } finally {
      setNotifySending(null);
    }
  }

  // ─── Chat functions ───

  async function sendChatMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      // Will be picked up by next poll
    } catch { /* ignore */ }
  }

  async function sendToChat(result: QueryResult) {
    if (!result.analysis) return;
    const snippet = result.analysis.replace(/<[^>]+>/g, "").substring(0, 150);
    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `📊 ${result.question}`,
          sharePreview: {
            historyId: result.historyId || 0,
            question: result.question,
            analysisSnippet: snippet,
          },
        }),
      });
      if (!chatOpen) setChatOpen(true);
    } catch { /* ignore */ }
  }

  function closeOnboarding() {
    setOnboardingStep(-1);
    fetch("/api/user/onboarding", { method: "POST" }).catch(() => {});
  }

  const defaultSuggestions = [
    t("suggestion.1"),
    t("suggestion.2"),
    t("suggestion.3"),
    t("suggestion.4"),
  ];

  const displayGeneral = generalSuggestions.length > 0 ? generalSuggestions : defaultSuggestions;

  const hasMessages = messages.length > 0;
  const showEmpty = !hasMessages && !loading;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white relative">
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

        {/* History + Favorites */}
        <div className="flex-1 overflow-y-auto px-2">
          {favorites.length > 0 && (
            <>
              <p className="text-xs text-amber-400/40 px-2 py-2 uppercase tracking-wider">{t("nav.favorites")}</p>
              {favorites.map((fav) => (
                <div key={fav.id} className="flex items-center group mb-0.5">
                  <button
                    onClick={() => runQuery(fav.question)}
                    className="flex-1 text-left px-2 py-2 rounded-md hover:bg-white/5 transition min-w-0"
                  >
                    <p className="text-sm truncate text-amber-400/70 group-hover:text-amber-300 transition">{fav.question}</p>
                  </button>
                  <button
                    onClick={() => toggleFavorite(fav.question, fav.sql)}
                    className="p-1 text-amber-400 hover:text-amber-300 transition shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" /></svg>
                  </button>
                </div>
              ))}
            </>
          )}
          <p className="text-xs text-white/30 px-2 py-2 uppercase tracking-wider">{t("nav.history")}</p>
          {history.length === 0 ? (
            <p className="text-white/20 text-xs px-2">{t("main.noHistory")}</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="flex items-center group mb-0.5">
                <button
                  onClick={() => handleHistoryClick(item)}
                  className="flex-1 text-left px-2 py-2 rounded-md hover:bg-white/5 transition min-w-0"
                >
                  <p className="text-sm truncate text-white/70 group-hover:text-white transition">{item.question}</p>
                  <p className="text-[11px] text-white/25 mt-0.5">
                    {item.error ? t("main.error") : `${item.row_count} ${t("main.rows")}`}
                    {" · "}
                    {new Date(item.created_at).toLocaleDateString("ru")}
                  </p>
                </button>
                <button
                  onClick={() => toggleFavorite(item.question, item.sql)}
                  className={`p-1 transition shrink-0 ${
                    favorites.some((f) => f.question === item.question)
                      ? "text-amber-400"
                      : "text-white/10 hover:text-white/30"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" /></svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Bottom nav */}
        <div className="border-t border-white/10 p-2 space-y-0.5">
          {user?.role === "admin" && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="3" rx="1" /><rect x="2" y="9" width="5" height="3" rx="1" /><rect x="9" y="7" width="5" height="5" rx="1" />
              </svg>
              {t("nav.dashboard")}
            </Link>
          )}
          <Link
            href="/invites"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            {t("nav.invites")}
          </Link>
          {(user?.role === "admin" || user?.canSchedule) && (
            <Link
              href="/schedules"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" />
              </svg>
              {t("nav.schedules")}
            </Link>
          )}
          {(user?.role === "admin" || user?.canTrain) && (
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
              {user.isVip && (
                <svg width="16" height="16" viewBox="0 0 16 16" className="text-amber-400 vip-badge">
                  <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" fill="currentColor" />
                </svg>
              )}
              {/* Chat toggle */}
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={`relative p-1.5 rounded-lg transition ${chatOpen ? "text-blue-400 bg-blue-500/10" : "text-white/30 hover:text-white/60 hover:bg-white/5"}`}
                title={t("main.chat")}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 3h12v8H6l-3 2v-2H2z" />
                </svg>
                {onlineUsers.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-[#0a0a0a]" />
                )}
              </button>
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
                {/* Personal suggestions */}
                {personalSuggestions.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-purple-400/50 uppercase tracking-wider font-medium mb-2 px-1">
                      {t("main.forYou")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {personalSuggestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => runQuery(q)}
                          className="text-left px-4 py-3 rounded-xl border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/5 transition text-sm text-white/60 hover:text-white"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* General suggestions */}
                <p className="text-xs text-white/30 uppercase tracking-wider font-medium mb-2 px-1">
                  {t("main.popular")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayGeneral.map((q) => (
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
                      {/* Per-query header bar */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl">
                        {/* Favorite toggle */}
                        <button
                          onClick={() => toggleFavorite(msg.result!.question, msg.result!.sql)}
                          className={`p-1 transition shrink-0 ${
                            favorites.some((f) => f.question === msg.result!.question)
                              ? "text-amber-400"
                              : "text-white/20 hover:text-white/40"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" /></svg>
                        </button>
                        {/* Title */}
                        <span className="flex-1 text-sm text-white/60 truncate min-w-0">
                          {msg.result.question.length > 60 ? msg.result.question.substring(0, 60) + "..." : msg.result.question}
                        </span>
                        {/* Execution time badge */}
                        {msg.result.executionMs > 0 && (
                          <span className="text-[11px] text-white/25 font-mono shrink-0">
                            {msg.result.executionMs}{t("main.ms")}
                          </span>
                        )}
                        {/* Send to chat */}
                        {!msg.result.error && msg.result.analysis && (
                          <button
                            onClick={() => sendToChat(msg.result!)}
                            className="text-white/20 hover:text-blue-400 transition p-1 rounded shrink-0"
                            title={t("main.sendToChat")}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M2 3h12v8H6l-3 2v-2H2z" />
                            </svg>
                          </button>
                        )}
                        {/* Re-execute */}
                        <button
                          onClick={() => { setMessages([]); runQuery(msg.result!.question); }}
                          className="text-white/20 hover:text-white/50 transition p-1 rounded shrink-0"
                          title={t("main.reExecute")}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M1.5 8a6.5 6.5 0 0 1 11.25-4.5M14.5 8a6.5 6.5 0 0 1-11.25 4.5" />
                            <path d="M13.5 1v3.5H10M2.5 15v-3.5H6" />
                          </svg>
                        </button>
                        {/* Share */}
                        {!msg.result.error && (
                          <button
                            onClick={openShareModal}
                            className="text-white/20 hover:text-white/50 transition p-1 rounded shrink-0"
                            title={t("main.share")}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <circle cx="12" cy="3" r="2" /><circle cx="4" cy="8" r="2" /><circle cx="12" cy="13" r="2" />
                              <path d="M5.7 9.1l4.6 2.8M10.3 4.1l-4.6 2.8" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Not saved prompt (old history items) */}
                      {!msg.result.error && msg.result.rows.length === 0 && msg.result.sql && !msg.result.analysis && msg.result.historyId && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                          <p className="text-sm text-white/50">{t("main.queryNotSaved")}</p>
                          <button
                            onClick={() => { setMessages([]); runQuery(msg.result!.question); }}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 transition"
                          >
                            {t("main.runQuery")}
                          </button>
                        </div>
                      )}

                      {msg.result.error && (
                        <div className="space-y-3">
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                            {msg.result.error}
                          </div>

                          {/* Smart error recovery */}
                          {!fixSuggestion && !fixLoading && msg.result.sql && (
                            <button
                              onClick={() => requestFix(msg.result!.question, msg.result!.sql, msg.result!.error!)}
                              className="flex items-center gap-2 text-sm text-amber-400/60 hover:text-amber-400 transition"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 10.5v.5" />
                              </svg>
                              {t("main.suggestFix")}
                            </button>
                          )}

                          {fixLoading && (
                            <div className="flex items-center gap-2 text-xs text-white/40">
                              <div className="animate-spin h-3 w-3 border border-amber-500/30 border-t-amber-400 rounded-full" />
                              {t("main.analyzingError")}
                            </div>
                          )}

                          {fixSuggestion && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                              <p className="text-sm text-white/70">{fixSuggestion.suggestion}</p>
                              {fixSuggestion.fixedSql && (
                                <pre className="text-xs font-mono text-emerald-400 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                                  {fixSuggestion.fixedSql}
                                </pre>
                              )}
                              <button
                                onClick={() => {
                                  setFixSuggestion(null);
                                  setMessages([]);
                                  runQuery(msg.result!.question);
                                }}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 transition"
                              >
                                {t("main.tryAgain")}
                              </button>
                            </div>
                          )}
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
                          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs text-white/40">
                              {msg.result.rowCount} {t("main.rows")} · {msg.result.executionMs}{t("main.ms")}
                            </span>
                            <button
                              onClick={() => downloadCSV(msg.result!.fields, msg.result!.rows)}
                              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition"
                              title={t("main.exportCsv")}
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3" /></svg>
                              CSV
                            </button>
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
                            <button
                              onClick={() => copySQL(msg.result!.sql)}
                              className="text-white/30 hover:text-white/60 transition p-1 rounded"
                              title={t("main.copySql")}
                            >
                              {copiedSql ? (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8.5l3 3 7-7" /></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" /></svg>
                              )}
                            </button>
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

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-sm font-semibold">{t("main.shareResults")}</h3>
              <button onClick={() => setShowShareModal(false)} className="text-white/30 hover:text-white transition p-1">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(80vh-60px)]">
              {/* Link section */}
              {shareModalLoading ? (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <div className="animate-spin h-3 w-3 border border-blue-500/30 border-t-blue-400 rounded-full" />
                  {t("main.sharing")}
                </div>
              ) : shareModalUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareModalUrl}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 font-mono truncate"
                    />
                    <button
                      onClick={copyShareLink}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 transition shrink-0"
                    >
                      {shareModalCopied ? t("main.copied") : t("main.copyLink")}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Telegram section */}
              {shareModalUrl && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-white/30">{t("main.sendViaTelegram")}</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => handleUserSearch(e.target.value)}
                    placeholder={t("main.searchUsers")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 transition"
                    autoFocus
                  />

                  {userSearchResults.length > 0 && (
                    <div className="space-y-1">
                      {userSearchResults.map((u) => {
                        const sent = notifiedUsers.has(u.id);
                        const sending = notifySending === u.id;
                        return (
                          <button
                            key={u.id}
                            onClick={() => !sent && notifyUser(u.id)}
                            disabled={sending || sent}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition ${
                              sent
                                ? "bg-emerald-500/5 border border-emerald-500/20"
                                : "hover:bg-white/5 border border-transparent"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
                              {u.firstName?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {u.firstName}{u.lastName ? ` ${u.lastName}` : ""}
                              </p>
                              {u.username && (
                                <p className="text-xs text-white/30">@{u.username}</p>
                              )}
                            </div>
                            {sent ? (
                              <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8.5l3 3 7-7" /></svg>
                                {t("main.sent")}
                              </span>
                            ) : sending ? (
                              <span className="text-xs text-white/30 shrink-0">{t("main.sending")}</span>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/20 shrink-0">
                                <path d="M2 8l5 4V9.5h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7v2.5L2 8z" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {userSearch.length >= 2 && userSearchResults.length === 0 && (
                    <p className="text-xs text-white/20 text-center py-2">No users found</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Team Chat Panel — right side */}
      {chatOpen && (
        <aside className="w-72 border-l border-white/10 bg-[#111] flex flex-col shrink-0 hidden lg:flex">
          {/* Chat header */}
          <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("main.chat")}</h3>
            <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white transition p-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>

          {/* Online users */}
          {onlineUsers.length > 0 && (
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">{t("main.online")}</p>
              <div className="flex flex-wrap gap-1.5">
                {onlineUsers.map((u) => (
                  <span key={u.id} className="flex items-center gap-1 text-xs text-white/50 bg-white/5 rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    {u.username ? `@${u.username}` : u.firstName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-white/20 text-center py-8">{t("main.noMessages")}</p>
            )}
            {chatMessages.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-medium text-blue-400">
                    {m.username ? `@${m.username}` : m.firstName}
                  </span>
                  <span className="text-[10px] text-white/20">
                    {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">{m.message}</p>
                {m.sharePreview && (
                  <div
                    className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 mt-1 cursor-pointer hover:border-blue-500/40 transition"
                    onClick={() => m.sharePreview?.historyId && loadHistoryItem(m.sharePreview.historyId)}
                  >
                    <p className="text-[11px] text-blue-400 font-medium truncate">{m.sharePreview.question}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{m.sharePreview.analysisSnippet}</p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatPanelEndRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={sendChatMessage} className="border-t border-white/10 p-2">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t("main.typeMessage")}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500/50 transition"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 px-2.5 py-1.5 rounded-lg transition text-xs"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1l14 7-14 7V9.5L9 8 1 6.5z" /></svg>
              </button>
            </div>
          </form>
        </aside>
      )}

      {/* Onboarding Overlay */}
      {onboardingStep >= 0 && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-sm w-full p-6 text-center">
            {/* Step indicators */}
            <div className="flex justify-center gap-1.5 mb-6">
              {[0, 1, 2, 3].map((s) => (
                <div key={s} className={`h-1 w-8 rounded-full transition ${s <= onboardingStep ? "bg-blue-500" : "bg-white/10"}`} />
              ))}
            </div>

            {/* Step content */}
            <div className="mb-6">
              {onboardingStep === 0 && (
                <>
                  <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-blue-400">
                      <circle cx="8" cy="8" r="6" /><path d="M6 6.5c0-1.1.9-2 2-2s2 .9 2 2c0 .7-.4 1.4-1 1.7V9M8 11.5v.5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{t("main.onboarding1")}</h3>
                  <p className="text-sm text-white/50">{t("main.onboarding1desc")}</p>
                </>
              )}
              {onboardingStep === 1 && (
                <>
                  <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-purple-400">
                      <path d="M2 4h12M2 8h8M2 12h10" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{t("main.onboarding2")}</h3>
                  <p className="text-sm text-white/50">{t("main.onboarding2desc")}</p>
                </>
              )}
              {onboardingStep === 2 && (
                <>
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-emerald-400">
                      <path d="M2 3h12v8H6l-3 2v-2H2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{t("main.onboarding3")}</h3>
                  <p className="text-sm text-white/50">{t("main.onboarding3desc")}</p>
                </>
              )}
              {onboardingStep === 3 && (
                <>
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-amber-400">
                      <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{t("main.onboarding4")}</h3>
                  <p className="text-sm text-white/50">{t("main.onboarding4desc")}</p>
                </>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-center gap-3">
              <button
                onClick={closeOnboarding}
                className="px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition"
              >
                {t("main.skip")}
              </button>
              {onboardingStep < 3 ? (
                <button
                  onClick={() => setOnboardingStep((s) => s + 1)}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition"
                >
                  {t("main.next")}
                </button>
              ) : (
                <button
                  onClick={closeOnboarding}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition"
                >
                  {t("main.getStarted")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading history overlay */}
      {loadingHistoryId !== null && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-[#141414] border border-white/10 rounded-xl px-5 py-3">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
            <span className="text-sm text-white/60">{t("main.loadingHistory")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
