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
  createUser,
  updateLastSeen,
  findInviteByCode,
  useInvite,
  createInvite,
  listInvites,
  saveQueryHistory,
  getQueryHistory,
  createSchedule,
  getUserSchedules,
  deactivateSchedule,
} from "@querybot/engine";
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

// ─── /join command — BEFORE auth middleware ───

bot.command("join", async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply("Используй: /join КОД\n\nПример: /join a1b2c3d4");
    return;
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Check if already registered
  const existing = await findUserByTelegramId(appPool, telegramId);
  if (existing) {
    await ctx.reply("✅ Ты уже зарегистрирован!");
    return;
  }

  // Find and validate invite
  const invite = await findInviteByCode(appPool, code);
  if (
    !invite ||
    invite.used_by !== null ||
    (invite.expires_at && new Date(invite.expires_at) < new Date())
  ) {
    await ctx.reply("❌ Инвайт-код недействителен или уже использован.");
    return;
  }

  // Create user
  const user = await createUser(appPool, {
    telegram_id: telegramId,
    username: ctx.from?.username,
    first_name: ctx.from?.first_name || "User",
    last_name: ctx.from?.last_name,
    invited_by: invite.created_by,
  });

  await useInvite(appPool, invite.id, user.id);
  await ctx.reply(
    "🎉 Добро пожаловать! Ты зарегистрирован.\n\nТеперь можешь задавать вопросы о данных. Попробуй /start для примеров.",
  );
});

// ─── Auth middleware — DB user lookup ───

bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("⛔ Не удалось определить пользователя.");
    return;
  }

  const user = await findUserByTelegramId(appPool, telegramId);
  if (!user) {
    await ctx.reply(
      "⛔ Доступ запрещён. Попросите инвайт-код у @Nickelodeon и используйте /join КОД",
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
  return (ctx as Record<string, { id: number; telegram_id: string }>).appUser;
}

// ─── /start — with AI suggestions ───

bot.command("start", async (ctx) => {
  try {
    const tables = await getSchema(pool);
    const suggestions = await generateSuggestions(tables);

    const keyboard = new InlineKeyboard();
    for (const s of suggestions) {
      keyboard.text(s, `q:${s}`).row();
    }

    await ctx.reply(
      "👋 Привет! Я QueryBot — задай вопрос о данных на естественном языке, и я выполню SQL-запрос.\n\n" +
        "Попробуй один из примеров или напиши свой вопрос:\n\n" +
        "/schema — показать схему БД\n" +
        "/history — последние запросы\n" +
        "/invite — создать инвайт-код\n" +
        "/help — помощь",
      { reply_markup: keyboard },
    );
  } catch {
    await ctx.reply(
      "👋 Привет! Я QueryBot — задай вопрос о данных.\n\n" +
        "Примеры:\n" +
        "• Покажи топ-5 товаров по цене\n" +
        "• Сколько заказов в каждом статусе?\n\n" +
        "/schema — схема БД\n" +
        "/help — помощь",
    );
  }
});

// Handle inline keyboard callback for suggestions
bot.callbackQuery(/^q:(.+)$/, async (ctx) => {
  const question = ctx.match[1];
  await ctx.answerCallbackQuery();
  await processQuery(ctx, question);
});

// ─── /help ───

bot.command("help", async (ctx) => {
  await ctx.reply(
    "Просто напиши вопрос на русском или английском — я преобразую его в SQL и покажу результат.\n\n" +
      "⚠️ Только чтение (SELECT). Модификация данных невозможна.\n\n" +
      "Команды:\n" +
      "/start — приветствие + подсказки\n" +
      "/schema — схема базы данных\n" +
      "/history — последние 10 запросов\n" +
      "/invite — создать инвайт-код\n" +
      "/schedule [interval] [вопрос] — запланировать запрос\n" +
      "/schedules — мои расписания\n" +
      "/help — эта справка",
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
      "❌ Ошибка получения схемы: " +
        (err instanceof Error ? err.message : "Unknown"),
    );
  }
});

// ─── /history ───

bot.command("history", async (ctx) => {
  const user = getUser(ctx);
  const items = await getQueryHistory(appPool, user.id, 10);

  if (items.length === 0) {
    await ctx.reply("📋 У тебя пока нет запросов.");
    return;
  }

  const text = items
    .map((h, i) => {
      const status = h.error ? "❌" : `✅ ${h.row_count} строк`;
      const date = new Date(h.created_at).toLocaleString("ru");
      return `${i + 1}. ${escapeHtml(h.question)}\n   ${status} · ${date}`;
    })
    .join("\n\n");

  await ctx.reply(`<b>Последние запросы:</b>\n\n${text}`, {
    parse_mode: "HTML",
  });
});

// ─── /invite ───

bot.command("invite", async (ctx) => {
  const user = getUser(ctx);
  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await createInvite(appPool, user.id, code, expiresAt);

  const botUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "leadsaibot";
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "";

  let text = `🎟 Инвайт-код: <code>${code}</code>\n\n`;
  text += `Бот: /join ${code}\n`;
  if (webUrl) {
    text += `Веб: ${webUrl}/login?invite=${code}\n`;
  }
  text += `\nДействителен 7 дней.`;

  // Show existing invites
  const invites = await listInvites(appPool, user.id);
  if (invites.length > 1) {
    text += `\n\n<b>Твои инвайты (${invites.length}):</b>\n`;
    for (const inv of invites.slice(0, 5)) {
      const status = inv.used_by ? "✅ использован" : "⏳ активен";
      text += `<code>${inv.code}</code> — ${status}\n`;
    }
  }

  await ctx.reply(text, { parse_mode: "HTML" });
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
      "Используй: /schedule [интервал] [вопрос]\n\n" +
        "Интервалы: hourly, daily, weekly, monthly\n\n" +
        "Пример: /schedule daily Топ-5 товаров по продажам",
    );
    return;
  }

  const parts = args.split(/\s+/);
  const intervalKey = parts[0].toLowerCase();
  const question = parts.slice(1).join(" ");

  if (!question) {
    await ctx.reply("❌ Укажи вопрос после интервала.\n\nПример: /schedule daily Топ-5 товаров");
    return;
  }

  const cronExpr = CRON_PRESETS[intervalKey];
  if (!cronExpr) {
    await ctx.reply(
      `❌ Неизвестный интервал: ${intervalKey}\n\nДопустимые: hourly, daily, weekly, monthly`,
    );
    return;
  }

  await ctx.reply("⏳ Проверяю запрос...");

  // Validate by running the query
  const result = await query(pool, question);
  if (result.error) {
    await ctx.reply(`❌ Запрос с ошибкой: ${result.error}`);
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
    `✅ Расписание создано!\n\n` +
      `📋 ${escapeHtml(question)}\n` +
      `⏰ ${intervalKey}\n` +
      `🆔 ID: ${schedule.id}\n\n` +
      `Отменить: /cancel_${schedule.id}`,
    { parse_mode: "HTML" },
  );
});

// ─── /schedules ───

bot.command("schedules", async (ctx) => {
  const user = getUser(ctx);
  const schedules = await getUserSchedules(appPool, user.id);

  const active = schedules.filter((s) => s.is_active);
  if (active.length === 0) {
    await ctx.reply("📋 У тебя нет активных расписаний.\n\nСоздать: /schedule daily Твой вопрос");
    return;
  }

  const text = active
    .map((s) => {
      const lastRun = s.last_run_at
        ? new Date(s.last_run_at).toLocaleString("ru")
        : "ещё не запускался";
      return `🆔 ${s.id} · <code>${s.cron_expr}</code>\n📋 ${escapeHtml(s.question)}\n⏱ ${lastRun}\n/cancel_${s.id}`;
    })
    .join("\n\n");

  await ctx.reply(`<b>Активные расписания:</b>\n\n${text}`, {
    parse_mode: "HTML",
  });
});

// ─── /cancel_ID ───

bot.hears(/^\/cancel_(\d+)$/, async (ctx) => {
  const user = getUser(ctx);
  const scheduleId = parseInt(ctx.match[1], 10);

  const ok = await deactivateSchedule(appPool, scheduleId, user.id);
  if (!ok) {
    await ctx.reply("❌ Расписание не найдено или уже отменено.");
    return;
  }

  // Cancel the cron job
  const { cancelJob } = await import("./scheduler");
  cancelJob(scheduleId);

  await ctx.reply(`✅ Расписание #${scheduleId} отменено.`);
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
        `❌ ${result.error}\n\n<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const formatted = formatTelegram({
      sql: result.sql,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionMs: result.executionMs,
    });

    const message = `<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>\n\n<b>Результат:</b>\n${formatted}`;

    // Telegram messages have 4096 char limit
    if (message.length > 4096) {
      await ctx.reply(
        `<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>`,
        { parse_mode: "HTML" },
      );
      await ctx.reply(formatted, { parse_mode: "HTML" });
    } else {
      await ctx.reply(message, { parse_mode: "HTML" });
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

// ─── Start bot + scheduler ───

async function startWithRetry(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initScheduler(bot, appPool, pool);
      await bot.start({
        onStart: () => console.log("QueryBot started (long polling)"),
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
