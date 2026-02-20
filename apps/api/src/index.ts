import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import {
  createPool,
  createAppPool,
  query,
  createAuthToken,
  checkAuthToken,
  findUserByTelegramId,
  findUserById,
  updateLastSeen,
  saveQueryHistory,
  getQueryHistory,
  getSchema,
  generateSuggestions,
  saveSuggestions,
  getLatestSuggestions,
  createInvite,
  listInvites,
  getUserSchedules,
  createSchedule,
  deactivateSchedule,
} from "@querybot/engine";
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

// ─── Query ───

app.post("/api/query", requireAuth, async (req, res) => {
  try {
    const session = getSession(req);
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const result = await query(pool, question.trim());

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
    const tables = await getSchema(pool);
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
    const result = await query(pool, question);
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

// ─── Start ───

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`QueryBot API listening on port ${PORT}`);
});
