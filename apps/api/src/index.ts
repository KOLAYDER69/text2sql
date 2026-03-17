import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import {
  createPool,
  createAppPool,
  query,
  answerFollowUp,
  getSchema,
  translateQuestion,
  generateClarifications,
  suggestQueryFix,
  createAuthToken,
  checkAuthToken,
  findUserByTelegramId,
  findUserById,
  updateLastSeen,
  saveQueryHistory,
  getQueryHistory,
  generateSuggestions,
  generatePersonalSuggestions,
  generateDescriptionSuggestions,
  saveSuggestions,
  getLatestSuggestions,
  createInvite,
  listInvites,
  getUserSchedules,
  createSchedule,
  deactivateSchedule,
  getAllSchemaDescriptions,
  upsertSchemaDescription,
  deleteSchemaDescription,
  buildDescriptionsMap,
  listInvitedUsers,
  updateUserPermissions,
  addFavorite,
  removeFavorite,
  getUserFavorites,
  createSharedQuery,
  getSharedQuery,
  searchUsers,
  getQueryHistoryById,
  getChatMessages,
  getRecentChatMessages,
  createChatMessage,
  getOnlineUsers,
  markOnboardingSeen,
  getDashboardPlans,
  upsertDashboardPlan,
  getDashboardTasks,
  createDashboardTask,
  updateDashboardTask,
  deleteDashboardTask,
  getDashboardNotes,
  upsertDashboardNote,
} from "@querybot/engine";
import type { FollowUpMessage, SchemaDescriptions } from "@querybot/engine";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  type SessionPayload,
} from "./auth.js";
import {
  verifyTelegramLogin,
  type TelegramLoginData,
} from "./telegram-auth.js";

// ─── Env checks ───

const appDatabaseUrl = process.env.APP_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "leadsaibot";

if (!appDatabaseUrl) throw new Error("APP_DATABASE_URL is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

// ─── Pools (created once) ───

const appPool = createAppPool(appDatabaseUrl);
const pool = createPool(databaseUrl);

// ─── Descriptions cache (2 min) ───

let descriptionsCache: SchemaDescriptions | null = null;
let descriptionsCacheAt = 0;
const DESCRIPTIONS_TTL = 2 * 60 * 1000;

async function getDescriptions(): Promise<SchemaDescriptions> {
  if (descriptionsCache && Date.now() - descriptionsCacheAt < DESCRIPTIONS_TTL) {
    return descriptionsCache;
  }
  const rows = await getAllSchemaDescriptions(appPool);
  descriptionsCache = buildDescriptionsMap(rows);
  descriptionsCacheAt = Date.now();
  return descriptionsCache;
}

function invalidateDescriptions() {
  descriptionsCache = null;
  descriptionsCacheAt = 0;
}

// ─── Telegram Bot API helper ───

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!botToken) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Express app ───

const app = express();
app.use(express.json());
app.use(cookieParser());

// Helper to get session from req (set by requireAuth middleware)
function getSession(req: express.Request): SessionPayload {
  return (req as express.Request & { session: SessionPayload }).session;
}

// ─── Auth routes ───

// POST /api/auth/init — create auth token for web login
app.post("/api/auth/init", async (_req, res) => {
  try {
    const token = crypto.randomBytes(16).toString("hex");
    await createAuthToken(appPool, token);

    const telegramUrl = `https://t.me/${botName}?start=auth_${token}`;
    res.json({ token, telegramUrl });
  } catch (err) {
    console.error("auth/init error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/auth/check?token=... — poll for auth completion
app.get("/api/auth/check", async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: "Missing token" });
      return;
    }

    const result = await checkAuthToken(appPool, token);
    if (!result.authenticated || !result.userId) {
      res.json({ authenticated: false });
      return;
    }

    const user = await findUserById(appPool, result.userId);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }

    const jwt = await createSession({
      userId: user.id,
      telegramId: Number(user.telegram_id),
      username: user.username,
      firstName: user.first_name,
      role: user.role,
      isVip: user.is_vip,
      canQuery: user.can_query,
      canInvite: user.can_invite,
      canTrain: user.can_train,
      canSchedule: user.can_schedule,
    });

    setSessionCookie(res, jwt);
    res.json({ authenticated: true });
  } catch (err) {
    console.error("auth/check error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/auth/telegram — direct Telegram widget login
app.post("/api/auth/telegram", async (req, res) => {
  try {
    const telegramData = req.body as TelegramLoginData;

    if (!botToken) {
      res.status(500).json({ error: "Server misconfigured" });
      return;
    }

    if (!verifyTelegramLogin(telegramData, botToken)) {
      res.status(401).json({ error: "Invalid Telegram auth data" });
      return;
    }

    const user = await findUserByTelegramId(appPool, telegramData.id);
    if (!user) {
      res.status(403).json({ error: "no_account" });
      return;
    }

    await updateLastSeen(appPool, user.id);

    const token = await createSession({
      userId: user.id,
      telegramId: Number(user.telegram_id),
      username: user.username,
      firstName: user.first_name,
      role: user.role,
      isVip: user.is_vip,
      canQuery: user.can_query,
      canInvite: user.can_invite,
      canTrain: user.can_train,
      canSchedule: user.can_schedule,
    });

    setSessionCookie(res, token);
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        role: user.role,
        isVip: user.is_vip,
      },
    });
  } catch (err) {
    console.error("auth/telegram error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/auth/logout
app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const session = getSession(req);
  const user = await findUserById(appPool, session.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({
    user: {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      role: user.role,
      isVip: user.is_vip,
      canQuery: user.can_query,
      canInvite: user.can_invite,
      canTrain: user.can_train,
      canSchedule: user.can_schedule,
      hasSeenOnboarding: user.has_seen_onboarding,
    },
  });
});

// ─── Clarify ───

app.post("/api/query/clarify", requireAuth, async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const [schema, translated, descriptions] = await Promise.all([
      getSchema(pool),
      translateQuestion(question.trim()),
      getDescriptions(),
    ]);

    const result = await generateClarifications(
      question.trim(),
      translated.english,
      translated.lang,
      schema.tables,
      schema.relations,
      descriptions,
    );

    res.json({
      questions: result.questions,
      skip: result.questions.length === 0,
    });
  } catch (err) {
    console.error("clarify error:", err);
    // Fail-safe: never block the user
    res.json({ questions: [], skip: true });
  }
});

// ─── Query ───

app.post("/api/query", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const descriptions = await getDescriptions();
    const result = await query(pool, question.trim(), descriptions);

    // Save to history with full results
    let historyId: number | undefined;
    try {
      historyId = await saveQueryHistory(appPool, {
        user_id: session.userId,
        platform: "web",
        question: question.trim(),
        sql: result.sql,
        row_count: result.rowCount,
        execution_ms: result.executionMs,
        error: result.error,
        rows_json: result.error ? null : result.rows,
        fields: result.error ? null : result.fields,
        analysis: result.analysis ?? null,
        chart_config: result.chart ?? null,
      });
    } catch (err) {
      console.error("Failed to save history:", err);
    }

    res.json({ ...result, historyId });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// ─── Follow-up ───

app.post("/api/query/followup", requireAuth, async (req, res) => {
  try {
    const { followUp, messages, context } = req.body as {
      followUp: string;
      messages: FollowUpMessage[];
      context: {
        question: string;
        sql: string;
        rows: Record<string, unknown>[];
        fields: string[];
        rowCount: number;
      };
    };

    if (!followUp || typeof followUp !== "string") {
      res.status(400).json({ error: "followUp is required" });
      return;
    }

    if (!context?.question || !context?.sql) {
      res.status(400).json({ error: "context with question and sql is required" });
      return;
    }

    const { tables } = await getSchema(pool);
    const answer = await answerFollowUp(
      followUp.trim(),
      messages || [],
      context,
      tables,
    );

    res.json({ answer });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// ─── Query Fix (smart error recovery) ───

app.post("/api/query/fix", requireAuth, async (req, res) => {
  try {
    const { question, sql, error } = req.body as {
      question: string;
      sql: string;
      error: string;
    };

    if (!question || !sql || !error) {
      res.status(400).json({ error: "question, sql, and error are required" });
      return;
    }

    const [schema, descriptions] = await Promise.all([
      getSchema(pool),
      getDescriptions(),
    ]);

    const fix = await suggestQueryFix(
      question,
      sql,
      error,
      schema.tables,
      schema.relations,
      descriptions,
    );

    res.json(fix);
  } catch (err) {
    console.error("query/fix error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// ─── History ───

app.get("/api/history", requireAuth, async (req, res) => {
  const session = getSession(req);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const history = await getQueryHistory(appPool, session.userId, limit);
  res.json({ history });
});

app.get("/api/history/:id", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const item = await getQueryHistoryById(appPool, id, session.userId);
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      id: item.id,
      question: item.question,
      sql: item.sql,
      rows: item.rows_json,
      fields: item.fields,
      rowCount: item.row_count ?? 0,
      executionMs: item.execution_ms ?? 0,
      error: item.error,
      analysis: item.analysis,
      chart: item.chart_config,
      createdAt: item.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Favorites ───

app.get("/api/favorites", requireAuth, async (req, res) => {
  const session = getSession(req);
  const favorites = await getUserFavorites(appPool, session.userId);
  res.json({ favorites });
});

app.post("/api/favorites", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { question, sql } = req.body as { question: string; sql: string };
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    const favorite = await addFavorite(appPool, session.userId, question, sql || "");
    res.json({ favorite });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.delete("/api/favorites/:id", requireAuth, async (req, res) => {
  const session = getSession(req);
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const favoriteId = parseInt(idParam, 10);
  if (isNaN(favoriteId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const ok = await removeFavorite(appPool, favoriteId, session.userId);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

// ─── Share ───

app.post("/api/share", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { question, sql, rows, fields, rowCount, analysis, chart } = req.body as {
      question: string;
      sql: string;
      rows: Record<string, unknown>[];
      fields: string[];
      rowCount: number;
      analysis?: string;
      chart?: unknown;
    };

    if (!question || !sql) {
      res.status(400).json({ error: "question and sql are required" });
      return;
    }

    const token = crypto.randomBytes(16).toString("hex");
    const limitedRows = (rows || []).slice(0, 200);

    await createSharedQuery(appPool, {
      token,
      user_id: session.userId,
      question,
      sql,
      rows_json: limitedRows,
      fields: fields || [],
      row_count: rowCount || 0,
      analysis: analysis || null,
      chart_config: chart || null,
    });

    const baseUrl = process.env.WEB_URL || "https://querybot.leadsai.ru";
    res.json({ token, url: `${baseUrl}/share/${token}` });
  } catch (err) {
    console.error("share error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.get("/api/share/:token", async (req, res) => {
  try {
    const tokenParam = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const shared = await getSharedQuery(appPool, tokenParam);
    if (!shared) {
      res.status(404).json({ error: "Not found or expired" });
      return;
    }

    res.json({
      question: shared.question,
      sql: shared.sql,
      rows: shared.rows_json,
      fields: shared.fields,
      rowCount: shared.row_count,
      analysis: shared.analysis,
      chart: shared.chart_config,
      createdAt: shared.created_at,
      expiresAt: shared.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── User search ───

app.get("/api/users/search", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.json({ users: [] });
      return;
    }
    const users = await searchUsers(appPool, q, session.userId, 10);
    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
      })),
    });
  } catch {
    res.json({ users: [] });
  }
});

// ─── Share notify (Telegram) ───

app.post("/api/share/notify", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { shareUrl, recipientId, question } = req.body as {
      shareUrl: string;
      recipientId: number;
      question: string;
    };

    if (!shareUrl || !recipientId || !question) {
      res.status(400).json({ error: "shareUrl, recipientId, and question are required" });
      return;
    }

    const recipient = await findUserById(appPool, recipientId);
    if (!recipient) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sender = await findUserById(appPool, session.userId);
    const senderName = sender?.username
      ? `@${sender.username}`
      : sender?.first_name ?? "Someone";

    const message =
      `📊 <b>${escapeHtml(senderName)}</b> поделился запросом:\n\n` +
      `<b>${escapeHtml(question)}</b>\n\n` +
      `👉 <a href="${shareUrl}">Открыть результаты</a>`;

    const ok = await sendTelegramMessage(recipient.telegram_id, message);
    if (!ok) {
      res.status(500).json({ error: "Failed to send message" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("share/notify error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Suggestions ───

app.get("/api/suggestions", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const general = await getLatestSuggestions(appPool);

    // Generate personal suggestions from user history (non-blocking, best-effort)
    let personal: string[] = [];
    try {
      const history = await getQueryHistory(appPool, session.userId, 15);
      const recentQuestions = history
        .filter((h) => !h.error)
        .map((h) => h.question);
      if (recentQuestions.length > 0) {
        const { tables } = await getSchema(pool);
        personal = await generatePersonalSuggestions(tables, recentQuestions);
      }
    } catch {
      // Personal suggestions are best-effort
    }

    res.json({
      general: general ?? [],
      personal,
      // Keep backwards compatibility
      suggestions: [...(general ?? []), ...personal],
    });
  } catch {
    res.json({ general: [], personal: [], suggestions: [] });
  }
});

app.post("/api/suggestions/refresh", requireAuth, async (_req, res) => {
  try {
    const { tables } = await getSchema(pool);
    const suggestions = await generateSuggestions(tables);
    await saveSuggestions(appPool, suggestions);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to refresh",
    });
  }
});

// ─── Invites ───

app.get("/api/invites", requireAuth, async (req, res) => {
  const session = getSession(req);
  const invites = await listInvites(appPool, session.userId);
  res.json({ invites });
});

app.post("/api/invites", requireAuth, async (req, res) => {
  const session = getSession(req);
  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await createInvite(appPool, session.userId, code, expiresAt);

  const deepLink = `https://t.me/${botName}?start=${code}`;
  res.json({ invite, code, deepLink });
});

// ─── Schedules ───

const CRON_PRESETS: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
};

app.get("/api/schedules", requireAuth, async (req, res) => {
  const session = getSession(req);
  const schedules = await getUserSchedules(appPool, session.userId);
  res.json({ schedules });
});

app.post("/api/schedules", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { question, interval, label } = req.body as {
      question: string;
      interval: string;
      label?: string;
    };

    if (!question || !interval) {
      res.status(400).json({ error: "question and interval are required" });
      return;
    }

    const cronExpr = CRON_PRESETS[interval] || interval;

    // Validate by running the query first
    const descriptions = await getDescriptions();
    const result = await query(pool, question, descriptions);
    if (result.error) {
      res
        .status(400)
        .json({ error: `Запрос с ошибкой: ${result.error}` });
      return;
    }

    const schedule = await createSchedule(appPool, {
      user_id: session.userId,
      question,
      sql: result.sql,
      cron_expr: cronExpr,
      label: label || null,
    });

    res.json({ schedule });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

app.delete("/api/schedules/:id", requireAuth, async (req, res) => {
  const session = getSession(req);
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scheduleId = parseInt(idParam, 10);
  if (isNaN(scheduleId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const ok = await deactivateSchedule(appPool, scheduleId, session.userId);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ok: true });
});

// ─── User management ───

app.get("/api/users/invited", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const users = await listInvitedUsers(appPool, session.userId);
    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        isVip: u.is_vip,
        canQuery: u.can_query,
        canInvite: u.can_invite,
        canTrain: u.can_train,
        canSchedule: u.can_schedule,
        createdAt: u.created_at,
        lastSeenAt: u.last_seen_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.put("/api/users/:id/permissions", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetId = parseInt(idParam, 10);
    if (isNaN(targetId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Only allow managing users you invited, or admins can manage anyone
    const target = await findUserById(appPool, targetId);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (session.role !== "admin" && target.invited_by !== session.userId) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const { is_vip, can_query, can_invite, can_train, can_schedule } = req.body as {
      is_vip: boolean;
      can_query: boolean;
      can_invite: boolean;
      can_train: boolean;
      can_schedule: boolean;
    };

    const updated = await updateUserPermissions(appPool, targetId, {
      is_vip: !!is_vip,
      can_query: can_query !== false,
      can_invite: can_invite !== false,
      can_train: !!can_train,
      can_schedule: can_schedule !== false,
    });

    res.json({
      user: {
        id: updated.id,
        username: updated.username,
        firstName: updated.first_name,
        isVip: updated.is_vip,
        canQuery: updated.can_query,
        canInvite: updated.can_invite,
        canTrain: updated.can_train,
        canSchedule: updated.can_schedule,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Schema & Descriptions (for training page) ───

app.get("/api/schema", requireAuth, async (_req, res) => {
  try {
    const { tables } = await getSchema(pool);
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.get("/api/schema/descriptions", requireAuth, async (_req, res) => {
  try {
    const rows = await getAllSchemaDescriptions(appPool);
    res.json({ descriptions: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.put("/api/schema/descriptions", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const me = await findUserById(appPool, session.userId);
    if (session.role !== "admin" && !me?.can_train) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const { table_name, column_name, description } = req.body as {
      table_name: string;
      column_name: string | null;
      description: string;
    };

    if (!table_name || typeof description !== "string") {
      res.status(400).json({ error: "table_name and description are required" });
      return;
    }

    // Empty description = delete
    if (!description.trim()) {
      await deleteSchemaDescription(appPool, table_name, column_name ?? null);
      invalidateDescriptions();
      res.json({ ok: true, deleted: true });
      return;
    }

    const row = await upsertSchemaDescription(appPool, {
      table_name,
      column_name: column_name ?? null,
      description: description.trim(),
      updated_by: session.userId,
    });
    invalidateDescriptions();
    res.json({ ok: true, description: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.delete("/api/schema/descriptions", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const me = await findUserById(appPool, session.userId);
    if (session.role !== "admin" && !me?.can_train) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const { table_name, column_name } = req.body as {
      table_name: string;
      column_name: string | null;
    };

    if (!table_name) {
      res.status(400).json({ error: "table_name is required" });
      return;
    }

    const ok = await deleteSchemaDescription(appPool, table_name, column_name ?? null);
    invalidateDescriptions();
    res.json({ ok, deleted: ok });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Schema description suggestions (AI) ───

app.post("/api/schema/suggest", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const me = await findUserById(appPool, session.userId);
    if (session.role !== "admin" && !me?.can_train) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const { table_name, column_name } = req.body as {
      table_name: string;
      column_name: string | null;
    };

    if (!table_name) {
      res.status(400).json({ error: "table_name is required" });
      return;
    }

    const [{ tables }, descMap] = await Promise.all([
      getSchema(pool),
      getDescriptions(),
    ]);

    const table = tables.find((t) => t.name === table_name);
    if (!table) {
      res.status(404).json({ error: "Table not found" });
      return;
    }

    const suggestions = await generateDescriptionSuggestions(
      table,
      column_name ?? null,
      descMap,
    );

    res.json({ suggestions });
  } catch (err) {
    console.error("schema/suggest error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// ─── Chat ───

app.get("/api/chat/messages", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    // Heartbeat: update last_seen on every poll
    updateLastSeen(appPool, session.userId).catch(() => {});

    const since = req.query.since as string | undefined;
    let messages;
    if (since) {
      messages = await getChatMessages(appPool, new Date(since), 50);
    } else {
      messages = await getRecentChatMessages(appPool, 50);
    }
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        userId: m.user_id,
        username: m.username,
        firstName: m.first_name,
        message: m.message,
        sharePreview: m.share_preview,
        createdAt: m.created_at,
      })),
    });
  } catch {
    res.json({ messages: [] });
  }
});

app.post("/api/chat/messages", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { message, sharePreview } = req.body as {
      message: string;
      sharePreview?: { historyId: number; question: string; analysisSnippet: string };
    };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    await createChatMessage(appPool, session.userId, message.trim(), sharePreview ?? null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

app.get("/api/chat/online", requireAuth, async (_req, res) => {
  try {
    const users = await getOnlineUsers(appPool);
    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        firstName: u.first_name,
      })),
    });
  } catch {
    res.json({ users: [] });
  }
});

// ─── Onboarding ───

app.post("/api/user/onboarding", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    await markOnboardingSeen(appPool, session.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Dashboard ───

// Helper: get Monday of the current week
function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

// GET /api/dashboard?year=2026
app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const year = Number(req.query.year) || new Date().getFullYear();
    const now = new Date();
    const thisMonday = getMonday(now);
    const lastMonday = getMonday(new Date(now.getTime() - 7 * 86400000));

    // Get plans from app DB
    const plans = await getDashboardPlans(appPool, year);

    // Get tasks for this week and last week
    const [thisWeekTasks, lastWeekTasks, notes] = await Promise.all([
      getDashboardTasks(appPool, thisMonday),
      getDashboardTasks(appPool, lastMonday),
      getDashboardNotes(appPool, thisMonday),
    ]);

    // Query actual metrics from linkpay DB
    let monthlyActuals: { month: number; replenishments: number; revenue: number }[] = [];
    let weekMetrics: {
      thisWeek: { operations: number; revenue: number; users: number; avg_check: number; new_users: number; deposits: number; deposit_volume: number; card_txns: number; subscriptions: number };
      lastWeek: { operations: number; revenue: number; users: number; avg_check: number; new_users: number; deposits: number; deposit_volume: number; card_txns: number; subscriptions: number };
    } | null = null;

    try {
      // Monthly actuals for the year:
      // - replenishments = ACCOUNT_DEPOSIT (USDT + BTC converted to USDT + TRX converted to USDT)
      // - revenue = SUM(fee) converted to USDT from ALL successful operations
      // Uses currency_rates table for BTC→USDT and TRX→USDT conversion
      const monthlyResult = await pool.query<{ m: number; deposits: string; rev: string; deposit_volume: string }>(
        `WITH rates AS (
           SELECT "from", "to", rate FROM currency_rates
           WHERE ("from" = 'BTC' AND "to" = 'USDT') OR ("from" = 'TRX' AND "to" = 'USDT')
         ),
         btc_rate AS (SELECT COALESCE((SELECT rate FROM rates WHERE "from" = 'BTC'), 84000) AS r),
         trx_rate AS (SELECT COALESCE((SELECT rate FROM rates WHERE "from" = 'TRX'), 0.12) AS r)
         SELECT
           EXTRACT(MONTH FROM o.created_at)::int AS m,
           COUNT(*) FILTER (WHERE o.type = 'ACCOUNT_DEPOSIT')::text AS deposits,
           COALESCE(SUM(
             CASE o.currency
               WHEN 'BTC' THEN o.fee * (SELECT r FROM btc_rate)
               WHEN 'TRX' THEN o.fee * (SELECT r FROM trx_rate)
               ELSE o.fee
             END
           ), 0)::text AS rev,
           COALESCE(SUM(
             CASE o.currency
               WHEN 'BTC' THEN o.amount * (SELECT r FROM btc_rate)
               WHEN 'TRX' THEN o.amount * (SELECT r FROM trx_rate)
               ELSE o.amount
             END
           ) FILTER (WHERE o.type = 'ACCOUNT_DEPOSIT'), 0)::text AS deposit_volume
         FROM operations o
         WHERE o.status = 'success'
           AND EXTRACT(YEAR FROM o.created_at) = $1
         GROUP BY 1
         ORDER BY 1`,
        [year],
      );
      monthlyActuals = monthlyResult.rows.map((r) => ({
        month: r.m,
        replenishments: parseInt(r.deposits, 10),
        revenue: parseFloat(r.rev),
      }));

      // This week vs last week metrics (all amounts converted to USDT)
      const weekResult = await pool.query<{
        period: string;
        ops: string;
        rev: string;
        users: string;
        avg_check: string;
        new_users: string;
        deposits: string;
        deposit_volume: string;
        card_txns: string;
        subscriptions: string;
      }>(
        `WITH rates AS (
           SELECT "from", "to", rate FROM currency_rates
           WHERE ("from" = 'BTC' AND "to" = 'USDT') OR ("from" = 'TRX' AND "to" = 'USDT')
         ),
         btc_rate AS (SELECT COALESCE((SELECT rate FROM rates WHERE "from" = 'BTC'), 84000) AS r),
         trx_rate AS (SELECT COALESCE((SELECT rate FROM rates WHERE "from" = 'TRX'), 0.12) AS r),
         periods AS (
           SELECT 'this' AS period, $1::date AS start_date, ($1::date + 7) AS end_date
           UNION ALL
           SELECT 'last', $2::date, ($2::date + 7)
         )
         SELECT
           p.period,
           COUNT(o.id)::text AS ops,
           COALESCE(SUM(
             CASE o.currency
               WHEN 'BTC' THEN o.fee * (SELECT r FROM btc_rate)
               WHEN 'TRX' THEN o.fee * (SELECT r FROM trx_rate)
               ELSE o.fee
             END
           ), 0)::text AS rev,
           COUNT(DISTINCT o.user_id)::text AS users,
           CASE WHEN COUNT(o.id) > 0 THEN (
             SUM(CASE o.currency WHEN 'BTC' THEN o.fee * (SELECT r FROM btc_rate) WHEN 'TRX' THEN o.fee * (SELECT r FROM trx_rate) ELSE o.fee END)
             / COUNT(o.id)
           )::text ELSE '0' END AS avg_check,
           (SELECT COUNT(*)::text FROM users u WHERE u.created_at >= p.start_date AND u.created_at < p.end_date) AS new_users,
           COUNT(*) FILTER (WHERE o.type = 'ACCOUNT_DEPOSIT')::text AS deposits,
           COALESCE(SUM(
             CASE o.currency
               WHEN 'BTC' THEN o.amount * (SELECT r FROM btc_rate)
               WHEN 'TRX' THEN o.amount * (SELECT r FROM trx_rate)
               ELSE o.amount
             END
           ) FILTER (WHERE o.type = 'ACCOUNT_DEPOSIT'), 0)::text AS deposit_volume,
           COUNT(*) FILTER (WHERE o.type = 'CARD_EXTERNAL')::text AS card_txns,
           COUNT(*) FILTER (WHERE o.type = 'SUBSCRIPTION')::text AS subscriptions
         FROM periods p
         LEFT JOIN operations o ON o.created_at >= p.start_date AND o.created_at < p.end_date AND o.status = 'success'
         GROUP BY p.period, p.start_date, p.end_date`,
        [thisMonday, lastMonday],
      );

      const thisW = weekResult.rows.find((r) => r.period === "this");
      const lastW = weekResult.rows.find((r) => r.period === "last");
      const parseWeek = (w: typeof thisW) => ({
        operations: parseInt(w?.ops ?? "0", 10),
        revenue: parseFloat(w?.rev ?? "0"),
        users: parseInt(w?.users ?? "0", 10),
        avg_check: parseFloat(w?.avg_check ?? "0"),
        new_users: parseInt(w?.new_users ?? "0", 10),
        deposits: parseInt(w?.deposits ?? "0", 10),
        deposit_volume: parseFloat(w?.deposit_volume ?? "0"),
        card_txns: parseInt(w?.card_txns ?? "0", 10),
        subscriptions: parseInt(w?.subscriptions ?? "0", 10),
      });
      weekMetrics = {
        thisWeek: parseWeek(thisW),
        lastWeek: parseWeek(lastW),
      };
    } catch (err) {
      console.error("Dashboard metrics query failed:", err);
    }

    // Build response
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    const currentMonth = now.getMonth() + 1;

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const plan = plans.find((p) => p.month === m);
      const actual = monthlyActuals.find((a) => a.month === m);
      return {
        month: m,
        label: monthNames[i],
        planned_replenishments: plan ? Number(plan.planned_replenishments) : 0,
        actual_replenishments: actual?.replenishments ?? 0,
        planned_revenue: plan ? Number(plan.planned_revenue) : 0,
        actual_revenue: actual?.revenue ?? 0,
        isFuture: m > currentMonth,
      };
    });

    const yearTotals = {
      planned_replenishments: monthly.reduce((s, m) => s + m.planned_replenishments, 0),
      actual_replenishments: monthly.reduce((s, m) => s + m.actual_replenishments, 0),
      planned_revenue: monthly.reduce((s, m) => s + m.planned_revenue, 0),
      actual_revenue: monthly.reduce((s, m) => s + m.actual_revenue, 0),
    };

    // Plan completion for months up to current
    const ytdPlanned = monthly.filter((m) => !m.isFuture).reduce((s, m) => s + m.planned_revenue, 0);
    const ytdActual = monthly.filter((m) => !m.isFuture).reduce((s, m) => s + m.actual_revenue, 0);
    const ytdPercent = ytdPlanned > 0 ? Math.round((ytdActual / ytdPlanned) * 100) : 0;

    res.json({
      year,
      thisMonday,
      lastMonday,
      monthly,
      yearTotals,
      ytdPercent,
      weekMetrics,
      thisWeekTasks,
      lastWeekTasks,
      notes: {
        problems: notes.find((n) => n.section === "problems")?.content ?? "",
        insights: notes.find((n) => n.section === "insights")?.content ?? "",
      },
    });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// PUT /api/dashboard/plans — upsert monthly plan
app.put("/api/dashboard/plans", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const { year, month, planned_replenishments, planned_revenue } = req.body;
    const plan = await upsertDashboardPlan(appPool, {
      year, month,
      planned_replenishments: planned_replenishments ?? 0,
      planned_revenue: planned_revenue ?? 0,
    });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// POST /api/dashboard/tasks — create task
app.post("/api/dashboard/tasks", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const task = await createDashboardTask(appPool, req.body);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// PUT /api/dashboard/tasks/:id — update task
app.put("/api/dashboard/tasks/:id", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await updateDashboardTask(appPool, parseInt(idParam, 10), req.body);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// DELETE /api/dashboard/tasks/:id
app.delete("/api/dashboard/tasks/:id", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await deleteDashboardTask(appPool, parseInt(idParam, 10));
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// PUT /api/dashboard/notes — upsert note (problems/insights)
app.put("/api/dashboard/notes", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const note = await upsertDashboardNote(appPool, req.body);
    res.json({ note });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ─── Start ───

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`QueryBot API listening on port ${PORT}`);
});
