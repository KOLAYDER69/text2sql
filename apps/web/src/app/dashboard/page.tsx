"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useI18n, LangSwitcher, type TranslationKey } from "@/lib/i18n";
import { HoloLogo } from "../holo-logo";

// ─── Types ───

type MonthlyData = {
  month: number;
  label: string;
  planned_replenishments: number;
  actual_replenishments: number;
  planned_revenue: number;
  actual_revenue: number;
  isFuture: boolean;
};

type WeekPeriod = {
  operations: number; revenue: number; users: number; avg_check: number; new_users: number;
  deposits: number; deposit_volume: number; card_txns: number; subscriptions: number;
};
type WeekMetrics = { thisWeek: WeekPeriod; lastWeek: WeekPeriod };

type DashTask = {
  id: number;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: string | null;
  status: "planned" | "in_progress" | "completed" | "blocked";
  blocker: string | null;
  new_due_date: string | null;
  week_start: string;
};

type DashboardData = {
  year: number;
  thisMonday: string;
  lastMonday: string;
  monthly: MonthlyData[];
  yearTotals: { planned_replenishments: number; actual_replenishments: number; planned_revenue: number; actual_revenue: number };
  ytdPercent: number;
  weekMetrics: WeekMetrics | null;
  thisWeekTasks: DashTask[];
  lastWeekTasks: DashTask[];
  notes: { problems: string; insights: string };
};

// ─── Helpers ───

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("ru-RU");
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M \u20BD";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K \u20BD";
  return n.toLocaleString("ru-RU") + " \u20BD";
}

function delta(current: number, previous: number): { value: string; positive: boolean; zero: boolean } {
  if (previous === 0 && current === 0) return { value: "0%", positive: false, zero: true };
  if (previous === 0) return { value: "+\u221E", positive: true, zero: false };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { value: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0, zero: pct === 0 };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatWeekRange(monday: string): string {
  const start = new Date(monday);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${fmt(start)} \u2014 ${fmt(end)}`;
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "rgba(17, 17, 17, 0.95)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-white/10 text-white/60",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  blocked: "bg-red-500/20 text-red-400",
};

const STATUS_ICONS: Record<string, string> = {
  planned: "\u25CB",
  in_progress: "\u25D4",
  completed: "\u2713",
  blocked: "\u2717",
};

// ─── Component ───

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ role: string } | null>(null);

  // Plan editing
  const [editingPlan, setEditingPlan] = useState<{ month: number; replenishments: string; revenue: string } | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Task creation
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [addingTask, setAddingTask] = useState(false);

  // Notes editing
  const [problemsText, setProblemsText] = useState("");
  const [savingProblems, setSavingProblems] = useState(false);
  const [problemsDirty, setProblemsDirty] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [meRes, dashRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/dashboard?year=${new Date().getFullYear()}`),
      ]);
      if (meRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setData(dashData);
        setProblemsText(dashData.notes?.problems ?? "");
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ─── Plan save ───
  async function savePlan() {
    if (!editingPlan || !data) return;
    setSavingPlan(true);
    try {
      await fetch("/api/dashboard/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: data.year,
          month: editingPlan.month,
          planned_replenishments: parseInt(editingPlan.replenishments, 10) || 0,
          planned_revenue: parseFloat(editingPlan.revenue) || 0,
        }),
      });
      setEditingPlan(null);
      loadDashboard();
    } finally {
      setSavingPlan(false);
    }
  }

  // ─── Task actions ───
  async function addTask() {
    if (!newTask.title.trim() || !data) return;
    setAddingTask(true);
    try {
      await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTask.title.trim(),
          due_date: newTask.due_date || null,
          week_start: data.thisMonday,
        }),
      });
      setNewTask({ title: "", due_date: "" });
      loadDashboard();
    } finally {
      setAddingTask(false);
    }
  }

  async function updateTaskStatus(taskId: number, status: string, blocker?: string, newDueDate?: string) {
    await fetch(`/api/dashboard/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, blocker: blocker ?? null, new_due_date: newDueDate ?? null }),
    });
    loadDashboard();
  }

  async function deleteTask(taskId: number) {
    await fetch(`/api/dashboard/tasks/${taskId}`, { method: "DELETE" });
    loadDashboard();
  }

  // ─── Notes save ───
  async function saveProblems() {
    if (!data) return;
    setSavingProblems(true);
    try {
      await fetch("/api/dashboard/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: data.thisMonday, section: "problems", content: problemsText }),
      });
      setProblemsDirty(false);
    } finally {
      setSavingProblems(false);
    }
  }

  // ─── Chart data ───
  const barData = data?.monthly.filter((m) => !m.isFuture || m.planned_revenue > 0).map((m) => ({
    label: m.label,
    [lang === "ru" ? "План" : "Plan"]: m.planned_revenue,
    [lang === "ru" ? "Факт" : "Actual"]: m.actual_revenue,
  })) ?? [];

  const cumulativeData = (() => {
    if (!data) return [];
    let cumPlan = 0, cumFact = 0;
    return data.monthly.map((m) => {
      cumPlan += m.planned_revenue;
      cumFact += m.actual_revenue;
      return {
        label: m.label,
        [lang === "ru" ? "План" : "Plan"]: cumPlan,
        [lang === "ru" ? "Факт" : "Actual"]: m.isFuture && m.actual_revenue === 0 ? null : cumFact,
      };
    });
  })();

  // ─── Render ───
  if (loading) {
    return (
      <div className="flex h-screen bg-[#0a0a0a] text-white items-center justify-center">
        <div className="animate-pulse text-white/40">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex h-screen bg-[#0a0a0a] text-white items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 text-lg">Admin only</p>
          <Link href="/" className="text-blue-400 mt-4 block">Back</Link>
        </div>
      </div>
    );
  }

  const wm = data?.weekMetrics;
  const ytd = data?.ytdPercent ?? 0;
  const hasPlans = (data?.yearTotals.planned_revenue ?? 0) > 0;
  const behindPlan = hasPlans && ytd < 90;

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
          <Link href="/" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.queries")}
          </Link>
          <Link href="/dashboard" className="block px-3 py-2 rounded-lg text-sm text-white bg-white/10">
            {t("nav.dashboard")}
          </Link>
          <Link href="/invites" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.invites")}
          </Link>
          <Link href="/profile" className="block px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition">
            {t("nav.profile")}
          </Link>
        </nav>
        <div className="p-3 border-t border-white/10">
          <LangSwitcher className="px-3 py-2" />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="border-b border-white/10 p-4 lg:hidden flex items-center justify-between">
          <Link href="/"><HoloLogo size="sm" /></Link>
          <LangSwitcher />
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 lg:p-8 space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">{t("dash.title")}</h1>
              {data && (
                <p className="text-white/40 mt-1">
                  {t("dash.week")}: {formatWeekRange(data.thisMonday)} &middot; {data.year}
                </p>
              )}
            </div>

            {/* ─── KPI Cards ─── */}
            {data && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Replenishments YTD */}
                <KPICard
                  label={t("dash.replenishments")}
                  plan={data.yearTotals.planned_replenishments}
                  fact={data.yearTotals.actual_replenishments}
                  formatFn={fmt}
                  planLabel={t("dash.plan")}
                />
                {/* Revenue YTD */}
                <KPICard
                  label={t("dash.revenue")}
                  plan={data.yearTotals.planned_revenue}
                  fact={data.yearTotals.actual_revenue}
                  formatFn={fmtCurrency}
                  planLabel={t("dash.plan")}
                />
                {/* YTD % */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider">{t("dash.ytdPercent")}</p>
                  <p className={`text-3xl font-bold mt-2 ${ytd >= 100 ? "text-emerald-400" : ytd >= 80 ? "text-amber-400" : "text-red-400"}`}>
                    {ytd}%
                  </p>
                  <p className={`text-xs mt-1 ${ytd >= 100 ? "text-emerald-400/60" : ytd >= 80 ? "text-amber-400/60" : "text-red-400/60"}`}>
                    {ytd >= 100 ? t("dash.aheadOfPlan") : ytd >= 80 ? t("dash.onTrack") : t("dash.behindPlan")}
                  </p>
                </div>
                {/* Week revenue delta */}
                {wm && (
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                    <p className="text-xs text-white/40 uppercase tracking-wider">{t("dash.revenue")} {t("dash.weekOverWeek")}</p>
                    {(() => {
                      const d = delta(wm.thisWeek.revenue, wm.lastWeek.revenue);
                      return (
                        <>
                          <p className={`text-3xl font-bold mt-2 ${d.zero ? "text-white/40" : d.positive ? "text-emerald-400" : "text-red-400"}`}>
                            {d.value}
                          </p>
                          <p className="text-xs text-white/30 mt-1">
                            {fmtCurrency(wm.thisWeek.revenue)} vs {fmtCurrency(wm.lastWeek.revenue)}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ─── Monthly Bar Chart ─── */}
            {barData.length > 0 && (
              <Section title={t("dash.monthlyChart")}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} barGap={2}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} tickFormatter={(v: number) => fmtCurrency(v)} />
                      <Tooltip {...tooltipStyle} formatter={(value) => fmtCurrency(Number(value ?? 0))} />
                      <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }} />
                      <Bar dataKey={lang === "ru" ? "План" : "Plan"} fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.5} />
                      <Bar dataKey={lang === "ru" ? "Факт" : "Actual"} fill="#34d399" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Edit plan buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {data?.monthly.map((m) => (
                    <button
                      key={m.month}
                      onClick={() => setEditingPlan({
                        month: m.month,
                        replenishments: String(m.planned_replenishments),
                        revenue: String(m.planned_revenue),
                      })}
                      className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 transition"
                    >
                      {m.label}
                    </button>
                  ))}
                  <span className="text-xs text-white/20 self-center ml-1">{t("dash.editPlan")}</span>
                </div>

                {/* Plan edit modal */}
                {editingPlan && (
                  <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium">
                      {t("dash.editPlan")}: {data?.monthly.find((m) => m.month === editingPlan.month)?.label}
                    </p>
                    <div className="flex gap-4">
                      <label className="flex-1">
                        <span className="text-xs text-white/40">{t("dash.replenishments")}</span>
                        <input
                          type="number"
                          value={editingPlan.replenishments}
                          onChange={(e) => setEditingPlan({ ...editingPlan, replenishments: e.target.value })}
                          className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </label>
                      <label className="flex-1">
                        <span className="text-xs text-white/40">{t("dash.revenue")}</span>
                        <input
                          type="number"
                          value={editingPlan.revenue}
                          onChange={(e) => setEditingPlan({ ...editingPlan, revenue: e.target.value })}
                          className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={savePlan}
                        disabled={savingPlan}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition disabled:opacity-50"
                      >
                        {savingPlan ? t("dash.saving") : t("dash.save")}
                      </button>
                      <button
                        onClick={() => setEditingPlan(null)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition"
                      >
                        {lang === "ru" ? "Отмена" : "Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* ─── Cumulative Annual Chart ─── */}
            {cumulativeData.length > 0 && (
              <Section title={t("dash.annualChart")}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativeData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} tickFormatter={(v: number) => fmtCurrency(v)} />
                      <Tooltip {...tooltipStyle} formatter={(value) => fmtCurrency(Number(value ?? 0))} />
                      <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }} />
                      <Line type="monotone" dataKey={lang === "ru" ? "План" : "Plan"} stroke="#3b82f6" strokeWidth={2} strokeDasharray="8 4" dot={false} />
                      <Line type="monotone" dataKey={lang === "ru" ? "Факт" : "Actual"} stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            )}

            {/* ─── Key Metrics ─── */}
            {wm && (
              <Section title={t("dash.metrics")}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard label={t("dash.replenishments")} current={wm.thisWeek.deposits} previous={wm.lastWeek.deposits} formatFn={fmt} />
                  <MetricCard label={lang === "ru" ? "Объём депозитов" : "Deposit Volume"} current={wm.thisWeek.deposit_volume} previous={wm.lastWeek.deposit_volume} formatFn={fmtCurrency} />
                  <MetricCard label={t("dash.revenue")} current={wm.thisWeek.revenue} previous={wm.lastWeek.revenue} formatFn={fmtCurrency} />
                  <MetricCard label={t("dash.operations")} current={wm.thisWeek.operations} previous={wm.lastWeek.operations} formatFn={fmt} />
                  <MetricCard label={lang === "ru" ? "Карточные транзакции" : "Card Transactions"} current={wm.thisWeek.card_txns} previous={wm.lastWeek.card_txns} formatFn={fmt} />
                  <MetricCard label={t("dash.activeUsers")} current={wm.thisWeek.users} previous={wm.lastWeek.users} formatFn={fmt} />
                  <MetricCard label={t("dash.newUsers")} current={wm.thisWeek.new_users} previous={wm.lastWeek.new_users} formatFn={fmt} />
                  <MetricCard label={t("dash.avgCheck")} current={wm.thisWeek.avg_check} previous={wm.lastWeek.avg_check} formatFn={fmtCurrency} />
                </div>
                {!wm.thisWeek.operations && !wm.lastWeek.operations && (
                  <p className="text-sm text-amber-400/60 mt-3">{t("dash.noData")}</p>
                )}
              </Section>
            )}

            {/* ─── Problems & Solutions ─── */}
            {(behindPlan || problemsText) && data && (
              <Section title={t("dash.problems")} accent={behindPlan ? "red" : undefined}>
                {behindPlan && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
                    <p className="text-red-400 text-sm font-medium">
                      {t("dash.behindPlan")}: {t("dash.ytdPercent")} = {ytd}%
                    </p>
                    <p className="text-red-400/60 text-xs mt-1">
                      {t("dash.revenue")}: {fmtCurrency(data.yearTotals.actual_revenue)} / {fmtCurrency(data.yearTotals.planned_revenue)}
                    </p>
                  </div>
                )}
                <textarea
                  value={problemsText}
                  onChange={(e) => { setProblemsText(e.target.value); setProblemsDirty(true); }}
                  placeholder={t("dash.problemsPlaceholder")}
                  rows={5}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-blue-500 resize-y"
                />
                {problemsDirty && (
                  <button
                    onClick={saveProblems}
                    disabled={savingProblems}
                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition disabled:opacity-50"
                  >
                    {savingProblems ? t("dash.saving") : t("dash.save")}
                  </button>
                )}
              </Section>
            )}

            {/* ─── Tasks This Week ─── */}
            {data && (
              <Section title={t("dash.tasksThisWeek")}>
                <div className="space-y-2">
                  {data.thisWeekTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={(status) => updateTaskStatus(task.id, status)}
                      onDelete={() => deleteTask(task.id)}
                      lang={lang}
                      t={t}
                    />
                  ))}
                  {data.thisWeekTasks.length === 0 && (
                    <p className="text-white/20 text-sm py-4 text-center">
                      {lang === "ru" ? "Нет задач" : "No tasks"}
                    </p>
                  )}
                </div>

                {/* Add task form */}
                <div className="mt-4 flex gap-2">
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder={t("dash.taskTitle")}
                    onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-white/20"
                  />
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white/60 w-36"
                  />
                  <button
                    onClick={addTask}
                    disabled={addingTask || !newTask.title.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {addingTask ? "..." : t("dash.addTask")}
                  </button>
                </div>
              </Section>
            )}

            {/* ─── Last Week Tasks Status ─── */}
            {data && data.lastWeekTasks.length > 0 && (
              <Section title={t("dash.tasksLastWeek")}>
                <div className="space-y-2">
                  {data.lastWeekTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={(status, blocker, newDueDate) => updateTaskStatus(task.id, status, blocker, newDueDate)}
                      onDelete={() => deleteTask(task.id)}
                      showBlocker
                      lang={lang}
                      t={t}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Spacer */}
            <div className="h-8" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  const borderColor = accent === "red" ? "border-red-500/20" : "border-white/10";
  return (
    <section className={`bg-white/[0.02] border ${borderColor} rounded-2xl p-5 lg:p-6`}>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function KPICard({ label, plan, fact, formatFn, planLabel }: { label: string; plan: number; fact: number; formatFn: (n: number) => string; planLabel?: string }) {
  const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0;
  const progressColor = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-2">{formatFn(fact)}</p>
      <p className="text-xs text-white/30 mt-1">{planLabel ?? "Plan"}: {formatFn(plan)}</p>
      {plan > 0 && (
        <div className="mt-3">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full ${progressColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <p className="text-xs text-white/30 mt-1">{pct}%</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, current, previous, formatFn }: { label: string; current: number; previous: number; formatFn: (n: number) => string }) {
  const d = delta(current, previous);
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold mt-2">{formatFn(current)}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`text-sm font-medium ${d.zero ? "text-white/30" : d.positive ? "text-emerald-400" : "text-red-400"}`}>
          {d.value}
        </span>
        <span className="text-xs text-white/20">{formatFn(previous)}</span>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onStatusChange,
  onDelete,
  showBlocker,
  lang,
  t,
}: {
  task: DashTask;
  onStatusChange: (status: string, blocker?: string, newDueDate?: string) => void;
  onDelete: () => void;
  showBlocker?: boolean;
  lang: string;
  t: (key: TranslationKey) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [blockerText, setBlockerText] = useState(task.blocker ?? "");
  const [newDueDateText, setNewDueDateText] = useState(task.new_due_date ?? "");

  const statusLabel = {
    planned: t("dash.planned"),
    in_progress: t("dash.inProgress"),
    completed: t("dash.completed"),
    blocked: t("dash.blocked"),
  }[task.status] ?? task.status;

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 hover:bg-white/[0.04] transition">
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${STATUS_COLORS[task.status]}`}>
          {STATUS_ICONS[task.status]}
        </span>

        {/* Title + date */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${task.status === "completed" ? "line-through text-white/40" : ""}`}>
            {task.title}
          </p>
          {task.due_date && (
            <p className="text-xs text-white/30 mt-0.5">
              {t("dash.dueDate")}: {formatDate(task.due_date)}
              {task.new_due_date && (
                <span className="text-amber-400/60 ml-2">
                  &rarr; {formatDate(task.new_due_date)}
                </span>
              )}
            </p>
          )}
          {task.blocker && (
            <p className="text-xs text-red-400/60 mt-0.5">
              {t("dash.blocker")}: {task.blocker}
            </p>
          )}
        </div>

        {/* Status badge */}
        <span className={`text-xs px-2 py-1 rounded-lg ${STATUS_COLORS[task.status]}`}>
          {statusLabel}
        </span>

        {/* Actions */}
        <button onClick={() => setExpanded(!expanded)} className="text-white/20 hover:text-white/40 transition text-lg">
          {expanded ? "\u2715" : "\u22EF"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
          {task.status !== "completed" && (
            <button onClick={() => onStatusChange("completed")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition">
              {t("dash.completed")}
            </button>
          )}
          {task.status !== "in_progress" && task.status !== "completed" && (
            <button onClick={() => onStatusChange("in_progress")} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition">
              {t("dash.inProgress")}
            </button>
          )}
          {task.status !== "blocked" && task.status !== "completed" && (
            <button onClick={() => setExpanded(true)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition">
              {t("dash.blocked")}
            </button>
          )}
          <button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-white/30 hover:bg-white/10 hover:text-red-400 transition ml-auto">
            {lang === "ru" ? "Удалить" : "Delete"}
          </button>

          {showBlocker && task.status !== "completed" && (
            <div className="w-full mt-2 space-y-2">
              <input
                value={blockerText}
                onChange={(e) => setBlockerText(e.target.value)}
                placeholder={t("dash.blocker")}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500 placeholder-white/20"
              />
              <input
                type="date"
                value={newDueDateText}
                onChange={(e) => setNewDueDateText(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white/60"
              />
              <button
                onClick={() => onStatusChange("blocked", blockerText, newDueDateText)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
              >
                {t("dash.save")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
