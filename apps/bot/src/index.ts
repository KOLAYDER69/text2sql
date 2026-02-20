import { Bot, InlineKeyboard } from "grammy";
import crypto from "node:crypto";
import {
  createPool,
  createAppPool,
  query,
  getSchema,
  formatTelegram,
  generateSuggestions,
  findUserByTelegramId,
  findUserById,
  createUser,
  updateLastSeen,
  findInviteByCode,
  useInvite,
  createInvite,
  listInvites,
  authenticateToken,
  saveSuggestions,
  getLatestSuggestions,
  saveQueryHistory,
  getQueryHistory,
  createSchedule,
  getUserSchedules,
  deactivateSchedule,
} from "@querybot/engine";
import { Cron } from "croner";
import { initScheduler, registerJob } from "./scheduler";

const token = process.env.TELEGRAM_BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!appDatabaseUrl) throw new Error("APP_DATABASE_URL is required");

const pool = createPool(databaseUrl);
const appPool = createAppPool(appDatabaseUrl);
const bot = new Bot(token);

const botUsername =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "leadsaibot";
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://querybot-nu.vercel.app";

// ─── /start with deep link invite handling — BEFORE auth middleware ───

bot.command("start", async (ctx) => {
  const payload = ctx.match?.trim();
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Deep link auth: /start auth_TOKEN
  if (payload && payload.startsWith("auth_")) {
    const authToken = payload.slice(5);
    const user = await findUserByTelegramId(appPool, telegramId);
    if (!user) {
      await ctx.reply(
        "You don't have access yet. Ask for an invite link first.\n\nContact @Nickelodeon for access.",
      );
      return;
    }
    const ok = await authenticateToken(appPool, authToken, user.id);
    if (ok) {
      await ctx.reply(
        "You have been signed in to the web dashboard. You can close this and go back to the browser.",
      );
    } else {
      await ctx.reply("This login link has expired. Please try again from the website.");
    }
    return;
  }

  // Deep link invite: /start INVITE_CODE
  if (payload) {
    const existing = await findUserByTelegramId(appPool, telegramId);
    if (existing) {
      // Already registered — show welcome with web button
      const keyboard = new InlineKeyboard().url(
        "Open Web Dashboard",
        webUrl,
      );
      await ctx.reply(
        "You already have access! Start asking questions or open the web version.",
        { reply_markup: keyboard },
      );
      // Fall through to show suggestions
      await showWelcome(ctx);
      return;
    }

    // Validate invite
    const invite = await findInviteByCode(appPool, payload);
    if (
      !invite ||
      invite.used_by !== null ||
      (invite.expires_at && new Date(invite.expires_at) < new Date())
    ) {
      await ctx.reply(
        "This invite link is invalid or has already been used.\n\nPlease request a new one.",
      );
      return;
    }

    // Auto-register
    const user = await createUser(appPool, {
      telegram_id: telegramId,
      username: ctx.from?.username,
      first_name: ctx.from?.first_name || "User",
      last_name: ctx.from?.last_name,
      invited_by: invite.created_by,
    });

    await useInvite(appPool, invite.id, user.id);

    // Store user in context for downstream
    (ctx as unknown as Record<string, unknown>).appUser = user;

    const keyboard = new InlineKeyboard().url(
      "Open Web Dashboard",
      webUrl,
    );

    await ctx.reply(
      "Welcome to <b>Leads AI — Insights</b>!\n\n" +
        "Your access has been activated. You can now:\n" +
        "- Ask questions about your data in natural language\n" +
        "- Get daily insights automatically via /schedule\n" +
        "- Access the web dashboard for a full experience\n\n" +
        "Try asking a question or tap the button below:",
      { parse_mode: "HTML", reply_markup: keyboard },
    );

    // Show suggestions
    await showSuggestions(ctx);
    return;
  }

  // Regular /start (no payload) — requires auth
  const user = await findUserByTelegramId(appPool, telegramId);
  if (!user) {
    await ctx.reply(
      "Access denied. You need an invite link to get started.\n\nContact @Nickelodeon for access.",
    );
    return;
  }

  (ctx as unknown as Record<string, unknown>).appUser = user;
  updateLastSeen(appPool, user.id).catch(() => {});
  await showWelcome(ctx);
});

async function showWelcome(ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> }) {
  await showSuggestions(ctx);
}

async function showSuggestions(ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> }) {
  try {
    const suggestions = await getLatestSuggestions(appPool);

    if (!suggestions || suggestions.length === 0) {
      await ctx.reply(
        "Ask any question about your data in natural language.\n\n/help — all commands",
      );
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const s of suggestions) {
      keyboard.text(s, `q:${s}`).row();
    }

    await ctx.reply(
      "<b>Example queries:</b>\n\n" +
        "/schema — database schema\n" +
        "/history — recent queries\n" +
        "/generate — create invite link\n" +
        "/help — all commands",
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  } catch {
    await ctx.reply(
      "Ask any question about your data in natural language.\n\n/help — all commands",
    );
  }
}

// ─── Auth middleware — DB user lookup ───

bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const user = await findUserByTelegramId(appPool, telegramId);
  if (!user) {
    await ctx.reply(
      "Access denied. You need an invite link to use this bot.\n\nContact @Nickelodeon for access.",
    );
    return;
  }

  // Store user in context for downstream handlers
  (ctx as unknown as Record<string, unknown>).appUser = user;

  // Update last seen (fire-and-forget)
  updateLastSeen(appPool, user.id).catch(() => {});

  await next();
});

// Helper to get user from context
function getUser(ctx: unknown) {
  return (ctx as Record<string, { id: number; telegram_id: string; role: string }>).appUser;
}

// Handle inline keyboard callback for suggestions
bot.callbackQuery(/^q:(.+)$/, async (ctx) => {
  const question = ctx.match[1];
  await ctx.answerCallbackQuery();
  await processQuery(ctx, question);
});

// ─── /help ───

bot.command("help", async (ctx) => {
  await ctx.reply(
    "Ask any question in natural language and I'll convert it to SQL.\n\n" +
      "Read-only (SELECT). No data modification.\n\n" +
      "Commands:\n" +
      "/start — welcome + suggestions\n" +
      "/schema — database schema\n" +
      "/history — recent 10 queries\n" +
      "/generate — create invite link\n" +
      "/schedule [interval] [question] — schedule a query\n" +
      "/schedules — my schedules\n" +
      "/help — this help",
  );
});

// ─── /schema ───

bot.command("schema", async (ctx) => {
  try {
    const tables = await getSchema(pool);
    const text = tables
      .map(
        (t) =>
          `<b>${t.name}</b>\n` +
          t.columns
            .map((c) => `  ${c.column_name} <i>${c.data_type}</i>`)
            .join("\n"),
      )
      .join("\n\n");
    await ctx.reply(text, { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(
      "Error fetching schema: " +
        (err instanceof Error ? err.message : "Unknown"),
    );
  }
});

// ─── /history ───

bot.command("history", async (ctx) => {
  const user = getUser(ctx);
  const items = await getQueryHistory(appPool, user.id, 10);

  if (items.length === 0) {
    await ctx.reply("No queries yet. Try asking a question!");
    return;
  }

  const text = items
    .map((h, i) => {
      const status = h.error ? "error" : `${h.row_count} rows`;
      const date = new Date(h.created_at).toLocaleString("ru");
      return `${i + 1}. ${escapeHtml(h.question)}\n   ${status} · ${date}`;
    })
    .join("\n\n");

  await ctx.reply(`<b>Recent queries:</b>\n\n${text}`, {
    parse_mode: "HTML",
  });
});

// ─── /generate — create invite with deep link ───

bot.command("generate", async (ctx) => {
  const user = getUser(ctx);
  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await createInvite(appPool, user.id, code, expiresAt);

  const deepLink = `https://t.me/${botUsername}?start=${code}`;

  const keyboard = new InlineKeyboard().url("Activate Access", deepLink);

  // Professional invite message for forwarding
  await ctx.reply(
    `<b>You're Invited to Leads AI — Insights</b>\n\n` +
      `You have been granted access to our private AI-powered database analytics tool.\n\n` +
      `Query your DB using natural language.\n` +
      `Get daily insights automatically.\n` +
      `Sync history between Web and Mobile.\n\n` +
      `<i>This invite expires in 7 days.</i>`,
    { parse_mode: "HTML", reply_markup: keyboard },
  );

  // Show existing invites summary to the admin
  const invites = await listInvites(appPool, user.id);
  if (invites.length > 1) {
    let summary = `\n<b>Your invites (${invites.length}):</b>\n`;
    for (const inv of invites.slice(0, 5)) {
      const status = inv.used_by ? "used" : "active";
      summary += `<code>${inv.code}</code> — ${status}\n`;
    }
    await ctx.reply(summary, { parse_mode: "HTML" });
  }
});

// Keep /invite as alias for /generate
bot.command("invite", async (ctx) => {
  const user = getUser(ctx);
  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await createInvite(appPool, user.id, code, expiresAt);

  const deepLink = `https://t.me/${botUsername}?start=${code}`;

  const keyboard = new InlineKeyboard().url("Activate Access", deepLink);

  await ctx.reply(
    `<b>You're Invited to Leads AI — Insights</b>\n\n` +
      `You have been granted access to our private AI-powered database analytics tool.\n\n` +
      `Query your DB using natural language.\n` +
      `Get daily insights automatically.\n` +
      `Sync history between Web and Mobile.\n\n` +
      `<i>This invite expires in 7 days.</i>`,
    { parse_mode: "HTML", reply_markup: keyboard },
  );
});

// ─── /schedule ───

const CRON_PRESETS: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
};

bot.command("schedule", async (ctx) => {
  const user = getUser(ctx);
  const args = ctx.match?.trim();

  if (!args) {
    await ctx.reply(
      "Usage: /schedule [interval] [question]\n\n" +
        "Intervals: hourly, daily, weekly, monthly\n\n" +
        "Example: /schedule daily Top 5 products by sales",
    );
    return;
  }

  const parts = args.split(/\s+/);
  const intervalKey = parts[0].toLowerCase();
  const question = parts.slice(1).join(" ");

  if (!question) {
    await ctx.reply("Specify a question after the interval.\n\nExample: /schedule daily Top 5 products");
    return;
  }

  const cronExpr = CRON_PRESETS[intervalKey];
  if (!cronExpr) {
    await ctx.reply(
      `Unknown interval: ${intervalKey}\n\nAllowed: hourly, daily, weekly, monthly`,
    );
    return;
  }

  await ctx.reply("Validating query...");

  // Validate by running the query
  const result = await query(pool, question);
  if (result.error) {
    await ctx.reply(`Query error: ${result.error}`);
    return;
  }

  const schedule = await createSchedule(appPool, {
    user_id: user.id,
    question,
    sql: result.sql,
    cron_expr: cronExpr,
    label: `${intervalKey}: ${question}`,
  });

  // Register the cron job
  registerJob(bot, appPool, pool, schedule.id, cronExpr, {
    telegramId: String(user.telegram_id),
    question,
  });

  await ctx.reply(
    `Schedule created!\n\n` +
      `<b>${escapeHtml(question)}</b>\n` +
      `Interval: ${intervalKey}\n` +
      `ID: ${schedule.id}\n\n` +
      `Cancel: /cancel_${schedule.id}`,
    { parse_mode: "HTML" },
  );
});

// ─── /schedules ───

bot.command("schedules", async (ctx) => {
  const user = getUser(ctx);
  const schedules = await getUserSchedules(appPool, user.id);

  const active = schedules.filter((s) => s.is_active);
  if (active.length === 0) {
    await ctx.reply("No active schedules.\n\nCreate one: /schedule daily Your question");
    return;
  }

  const text = active
    .map((s) => {
      const lastRun = s.last_run_at
        ? new Date(s.last_run_at).toLocaleString("ru")
        : "not run yet";
      return `ID ${s.id} · <code>${s.cron_expr}</code>\n<b>${escapeHtml(s.question)}</b>\nLast run: ${lastRun}\n/cancel_${s.id}`;
    })
    .join("\n\n");

  await ctx.reply(`<b>Active schedules:</b>\n\n${text}`, {
    parse_mode: "HTML",
  });
});

// ─── /cancel_ID ───

bot.hears(/^\/cancel_(\d+)$/, async (ctx) => {
  const user = getUser(ctx);
  const scheduleId = parseInt(ctx.match[1], 10);

  const ok = await deactivateSchedule(appPool, scheduleId, user.id);
  if (!ok) {
    await ctx.reply("Schedule not found or already cancelled.");
    return;
  }

  // Cancel the cron job
  const { cancelJob } = await import("./scheduler");
  cancelJob(scheduleId);

  await ctx.reply(`Schedule #${scheduleId} cancelled.`);
});

// ─── Schedule buttons — question store by hash ───

const questionStore = new Map<string, string>();

function storeQuestion(question: string): string {
  const hash = crypto.createHash("md5").update(question).digest("hex").slice(0, 8);
  questionStore.set(hash, question);
  // Auto-expire after 1 hour
  setTimeout(() => questionStore.delete(hash), 60 * 60 * 1000);
  return hash;
}

// Callback handler for schedule buttons
bot.callbackQuery(/^sched:(daily|weekly):(.+)$/, async (ctx) => {
  const interval = ctx.match[1];
  const hash = ctx.match[2];
  const question = questionStore.get(hash);

  if (!question) {
    await ctx.answerCallbackQuery({ text: "Запрос устарел. Отправьте вопрос заново." });
    return;
  }

  const user = getUser(ctx);
  const cronExpr = CRON_PRESETS[interval];

  // We already know the query works — just need the SQL
  const result = await query(pool, question);
  if (result.error) {
    await ctx.answerCallbackQuery({ text: "Ошибка запроса" });
    return;
  }

  const schedule = await createSchedule(appPool, {
    user_id: user.id,
    question,
    sql: result.sql,
    cron_expr: cronExpr,
    label: `${interval}: ${question}`,
  });

  registerJob(bot, appPool, pool, schedule.id, cronExpr, {
    telegramId: String(user.telegram_id),
    question,
  });

  const intervalLabel = interval === "daily" ? "Ежедневно" : "Еженедельно";
  await ctx.answerCallbackQuery({ text: `Расписание создано: ${intervalLabel}` });
  await ctx.reply(
    `✅ Расписание создано!\n\n` +
      `<b>${escapeHtml(question)}</b>\n` +
      `Интервал: ${intervalLabel}\n` +
      `ID: ${schedule.id}\n\n` +
      `Отмена: /cancel_${schedule.id}`,
    { parse_mode: "HTML" },
  );
});

// ─── Handle text messages — run query pipeline ───

bot.on("message:text", async (ctx) => {
  const question = ctx.message.text;
  await processQuery(ctx, question);
});

async function processQuery(
  ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> },
  question: string,
): Promise<void> {
  const user = getUser(ctx);

  await ctx.reply("⏳ Выполняю запрос...");

  try {
    const result = await query(pool, question);

    // Save to history
    await saveQueryHistory(appPool, {
      user_id: user.id,
      platform: "telegram",
      question,
      sql: result.sql,
      row_count: result.rowCount,
      execution_ms: result.executionMs,
      error: result.error,
    });

    if (result.error) {
      await ctx.reply(
        `❌ ${result.error}\n\n🔍 SQL:\n<pre>${escapeHtml(result.sql)}</pre>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // SQL block
    const sqlBlock = `🔍 SQL:\n<pre>${escapeHtml(result.sql)}</pre>`;

    // Data block
    const formatted = formatTelegram({
      sql: result.sql,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionMs: result.executionMs,
    });

    // Schedule buttons
    const hash = storeQuestion(question);
    const scheduleKeyboard = new InlineKeyboard()
      .text("📋 Ежедневно", `sched:daily:${hash}`)
      .text("📋 Еженедельно", `sched:weekly:${hash}`);

    const message = `${sqlBlock}\n\n${formatted}`;

    // Telegram messages have 4096 char limit
    if (message.length > 4096) {
      await ctx.reply(sqlBlock, { parse_mode: "HTML" });
      await ctx.reply(formatted, {
        parse_mode: "HTML",
        reply_markup: scheduleKeyboard,
      });
    } else {
      await ctx.reply(message, {
        parse_mode: "HTML",
        reply_markup: scheduleKeyboard,
      });
    }
  } catch (err) {
    await ctx.reply(
      "❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"),
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Suggestions refresh (hourly + on startup) ───

async function refreshSuggestions() {
  try {
    const tables = await getSchema(pool);
    const suggestions = await generateSuggestions(tables);
    await saveSuggestions(appPool, suggestions);
    console.log("Suggestions refreshed:", suggestions.length);
  } catch (err) {
    console.error("Failed to refresh suggestions:", err instanceof Error ? err.message : err);
  }
}

// ─── Start bot + scheduler ───

async function startWithRetry(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initScheduler(bot, appPool, pool);
      await bot.start({
        onStart: () => {
          console.log("QueryBot started (long polling)");

          // Register bot commands menu
          bot.api.setMyCommands([
            { command: "start", description: "Начать работу" },
            { command: "help", description: "Помощь" },
            { command: "schema", description: "Схема базы данных" },
            { command: "history", description: "История запросов" },
            { command: "generate", description: "Создать инвайт" },
            { command: "schedule", description: "Запланировать запрос" },
            { command: "schedules", description: "Мои расписания" },
          ]);

          // Generate suggestions on startup + refresh every hour
          refreshSuggestions();
          new Cron("0 * * * *", () => refreshSuggestions());
        },
      });
      return;
    } catch (err) {
      const isConflict =
        err instanceof Error && err.message.includes("409");
      if (isConflict && attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(
          `Conflict with another instance, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

startWithRetry().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
