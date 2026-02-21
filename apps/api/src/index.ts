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
  createAuthToken,
  checkAuthToken,
  findUserByTelegramId,
  findUserById,
  updateLastSeen,
  saveQueryHistory,
  getQueryHistory,
  generateSuggestions,
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
    });

    setSessionCookie(res, token);
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        role: user.role,
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
app.get("/api/auth/me", requireAuth, (req, res) => {
  const session = getSession(req);
  res.json({
    user: {
      id: session.userId,
      username: session.username,
      firstName: session.firstName,
      role: session.role,
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

    // Save to history (fire-and-forget)
    saveQueryHistory(appPool, {
      user_id: session.userId,
      platform: "web",
      question: question.trim(),
      sql: result.sql,
      row_count: result.rowCount,
      execution_ms: result.executionMs,
      error: result.error,
    }).catch((err) => console.error("Failed to save history:", err));

    res.json(result);
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

// ─── History ───

app.get("/api/history", requireAuth, async (req, res) => {
  const session = getSession(req);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const history = await getQueryHistory(appPool, session.userId, limit);
  res.json({ history });
});

// ─── Suggestions ───

app.get("/api/suggestions", requireAuth, async (_req, res) => {
  const suggestions = await getLatestSuggestions(appPool);
  res.json({
    suggestions:
      suggestions ?? ["Ask any question about your data in natural language"],
  });
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
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
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
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
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

// ─── Start ───

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`QueryBot API listening on port ${PORT}`);
});
