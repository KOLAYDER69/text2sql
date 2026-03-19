import { Bot, InlineKeyboard } from "grammy";
import crypto from "node:crypto";
import {
  createPool,
  createAppPool,
  query,
  getSchema,
  generateSQL,
  validateSQL,
  executeSQL,
  analyzeResults,
  formatTelegram,
  generateSuggestions,
  buildChartConfig,
  translateQuestion,
  generateClarifications,
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
  getAllSchemaDescriptions,
  buildDescriptionsMap,
} from "@querybot/engine";
import type { SchemaDescriptions } from "@querybot/engine";
import { buildQuickChartUrl } from "./chart-url";
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
      const keyboard = new InlineKeyboard().url(
        "Open Dashboard",
        webUrl,
      );
      await ctx.reply(
        "You're signed in! Tap the button below to open the dashboard.",
        { reply_markup: keyboard },
      );
    } else {
      const keyboard = new InlineKeyboard().url(
        "Try again",
        webUrl + "/login",
      );
      await ctx.reply(
        "This login link has expired. Please try again.",
        { reply_markup: keyboard },
      );
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
      "Welcome to <b>text2SQL</b>!\n\n" +
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
    const { tables } = await getSchema(pool);
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

async function handleGenerate(ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> }) {
  const user = getUser(ctx);
  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await createInvite(appPool, user.id, code, expiresAt);

  const deepLink = `https://t.me/${botUsername}?start=${code}`;

  const keyboard = new InlineKeyboard().url("Открыть ссылку", deepLink);

  // Message with copyable link text
  await ctx.reply(
    `✅ <b>Инвайт создан!</b>\n\n` +
      `📎 Ссылка для приглашения:\n<code>${deepLink}</code>\n\n` +
      `Отправьте эту ссылку новому пользователю — он нажмёт Start и получит доступ.\n\n` +
      `⏳ Действует 7 дней.`,
    { parse_mode: "HTML", reply_markup: keyboard },
  );

  // Show existing invites summary
  const invites = await listInvites(appPool, user.id);
  const usedCount = invites.filter((i) => i.used_by !== null).length;
  const activeCount = invites.filter(
    (i) => i.used_by === null && (!i.expires_at || new Date(i.expires_at) > new Date()),
  ).length;

  if (invites.length > 1) {
    await ctx.reply(
      `📊 <b>Ваши инвайты:</b> ${invites.length} всего · ${activeCount} активных · ${usedCount} использовано`,
      { parse_mode: "HTML" },
    );
  }
}

bot.command("generate", async (ctx) => handleGenerate(ctx));
bot.command("invite", async (ctx) => handleGenerate(ctx));

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
  const descriptions = await getDescriptions();
  const result = await query(pool, question, descriptions);
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

// ─── Clarification state ───

type ClarifyQuestion = { question: string; options: string[] };

type PendingClarification = {
  question: string;
  questions: ClarifyQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
  statusMsgId: number;
  chatId: number;
  schema: { tables: Awaited<ReturnType<typeof getSchema>>["tables"]; relations: Awaited<ReturnType<typeof getSchema>>["relations"] };
  user: ReturnType<typeof getUser>;
};

const pendingClarify = new Map<number, PendingClarification>();

const clarifyOptionStore = new Map<string, string>();

function storeClarifyOption(option: string): string {
  const hash = crypto.createHash("md5").update(option).digest("hex").slice(0, 8);
  clarifyOptionStore.set(hash, option);
  setTimeout(() => clarifyOptionStore.delete(hash), 5 * 60 * 1000);
  return hash;
}

function buildClarifyKeyboard(q: ClarifyQuestion, qIndex: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const opt of q.options) {
    const hash = storeClarifyOption(opt);
    kb.text(opt.length > 40 ? opt.slice(0, 37) + "..." : opt, `cq:${qIndex}:${hash}`).row();
  }
  kb.text("⏭ Пропустить", "cq:skip");
  return kb;
}

// Callback handler for clarification answers
bot.callbackQuery(/^cq:(\d+):(.+)$/, async (ctx) => {
  const chatId = ctx.callbackQuery.message?.chat.id;
  if (!chatId) return;

  const pending = pendingClarify.get(chatId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Уточнение устарело" });
    return;
  }

  const qIndex = parseInt(ctx.match[1], 10);
  const hash = ctx.match[2];
  const option = clarifyOptionStore.get(hash);
  if (!option) {
    await ctx.answerCallbackQuery({ text: "Вариант устарел" });
    return;
  }

  // Record answer
  pending.answers[qIndex] = option;
  await ctx.answerCallbackQuery({ text: option });

  // If more questions, show next
  const nextIndex = qIndex + 1;
  if (nextIndex < pending.questions.length) {
    pending.currentIndex = nextIndex;
    const nextQ = pending.questions[nextIndex];
    const kb = buildClarifyKeyboard(nextQ, nextIndex);
    try {
      await ctx.api.editMessageText(
        pending.chatId,
        pending.statusMsgId,
        `❓ ${nextQ.question}`,
        { reply_markup: kb },
      );
    } catch {
      const msg = await ctx.reply(`❓ ${nextQ.question}`, { reply_markup: kb });
      pending.statusMsgId = msg.message_id;
    }
  } else {
    // All answered — build enriched question and continue
    const context = pending.questions
      .map((q, i) => (pending.answers[i] ? `${q.question}: ${pending.answers[i]}` : null))
      .filter(Boolean)
      .join(". ");
    const enriched = context
      ? `${pending.question}. Контекст: ${context}.`
      : pending.question;

    pendingClarify.delete(chatId);
    await continueQuery(ctx, enriched, pending.question, pending.schema, pending.user);
  }
});

// Callback handler for clarification skip
bot.callbackQuery("cq:skip", async (ctx) => {
  const chatId = ctx.callbackQuery.message?.chat.id;
  if (!chatId) return;

  const pending = pendingClarify.get(chatId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Уточнение устарело" });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Пропущено" });
  pendingClarify.delete(chatId);
  await continueQuery(ctx, pending.question, pending.question, pending.schema, pending.user);
});

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
  const descriptions = await getDescriptions();
  const result = await query(pool, question, descriptions);
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
  ctx: {
    reply: (text: string, opts?: Record<string, unknown>) => Promise<{ chat: { id: number }; message_id: number }>;
    api: {
      editMessageText: (chatId: number, msgId: number, text: string, opts?: Record<string, unknown>) => Promise<unknown>;
      sendPhoto: (chatId: number | string, photo: string, other?: Record<string, unknown>) => Promise<unknown>;
    };
  },
  question: string,
): Promise<void> {
  const user = getUser(ctx);

  // Step 1: Status message
  const status = await ctx.reply("🧠 Анализирую вопрос...");
  const chatId = status.chat.id;
  const msgId = status.message_id;

  try {
    // Step 2: Get schema & translate question to English (in parallel)
    const [schema, translated] = await Promise.all([
      getSchema(pool),
      translateQuestion(question),
    ]);
    const { tables, relations } = schema;

    // Step 3: Check if clarification is needed
    const descriptions = await getDescriptions();
    let clarifyResult = { questions: [] as ClarifyQuestion[] };
    try {
      clarifyResult = await generateClarifications(
        question,
        translated.english,
        translated.lang,
        tables,
        relations,
        descriptions,
      );
    } catch {
      // fail-safe: skip clarification
    }

    if (clarifyResult.questions.length > 0) {
      // Show first clarification question
      const pending: PendingClarification = {
        question,
        questions: clarifyResult.questions,
        answers: {},
        currentIndex: 0,
        statusMsgId: msgId,
        chatId,
        schema: { tables, relations },
        user,
      };
      pendingClarify.set(chatId, pending);
      // Auto-expire after 5 minutes
      setTimeout(() => pendingClarify.delete(chatId), 5 * 60 * 1000);

      const firstQ = clarifyResult.questions[0];
      const kb = buildClarifyKeyboard(firstQ, 0);
      await ctx.api.editMessageText(chatId, msgId, `❓ ${firstQ.question}`, {
        reply_markup: kb,
      });
      return;
    }

    // No clarification needed — continue pipeline
    await ctx.api.editMessageText(chatId, msgId, "🧠 Генерирую SQL...");
    await runQueryPipeline(ctx, question, question, schema, user, chatId, msgId);
  } catch (err) {
    try {
      await ctx.api.editMessageText(
        chatId, msgId,
        "❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"),
      );
    } catch {
      await ctx.reply("❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"));
    }
  }
}

async function continueQuery(
  ctx: {
    reply: (text: string, opts?: Record<string, unknown>) => Promise<{ chat: { id: number }; message_id: number }>;
    api: {
      editMessageText: (chatId: number, msgId: number, text: string, opts?: Record<string, unknown>) => Promise<unknown>;
      sendPhoto: (chatId: number | string, photo: string, other?: Record<string, unknown>) => Promise<unknown>;
    };
  },
  enrichedQuestion: string,
  originalQuestion: string,
  schema: { tables: Awaited<ReturnType<typeof getSchema>>["tables"]; relations: Awaited<ReturnType<typeof getSchema>>["relations"] },
  user: ReturnType<typeof getUser>,
): Promise<void> {
  const status = await ctx.reply("🧠 Генерирую SQL...");
  const chatId = status.chat.id;
  const msgId = status.message_id;

  try {
    await runQueryPipeline(ctx, enrichedQuestion, originalQuestion, schema, user, chatId, msgId);
  } catch (err) {
    try {
      await ctx.api.editMessageText(
        chatId, msgId,
        "❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"),
      );
    } catch {
      await ctx.reply("❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"));
    }
  }
}

async function runQueryPipeline(
  ctx: {
    reply: (text: string, opts?: Record<string, unknown>) => Promise<{ chat: { id: number }; message_id: number }>;
    api: {
      editMessageText: (chatId: number, msgId: number, text: string, opts?: Record<string, unknown>) => Promise<unknown>;
      sendPhoto: (chatId: number | string, photo: string, other?: Record<string, unknown>) => Promise<unknown>;
    };
  },
  question: string,
  originalQuestion: string,
  schema: { tables: Awaited<ReturnType<typeof getSchema>>["tables"]; relations: Awaited<ReturnType<typeof getSchema>>["relations"] },
  user: ReturnType<typeof getUser>,
  chatId: number,
  msgId: number,
): Promise<void> {
  const { tables, relations } = schema;

  // Translate enriched question for SQL generation
  const [translated, descriptions] = await Promise.all([
    translateQuestion(question),
    getDescriptions(),
  ]);

  // Generate SQL from English question (more reliable)
  const sql = await generateSQL(translated.english, tables, relations, descriptions);

  await ctx.api.editMessageText(chatId, msgId, "⚡ Выполняю запрос...");

  // Validate
  const validation = validateSQL(sql);
  if (!validation.valid) {
    saveQueryHistory(appPool, {
      user_id: user.id, platform: "telegram", question: originalQuestion, sql,
      row_count: 0, execution_ms: 0, error: validation.error,
    }).catch(() => {});
    await ctx.api.editMessageText(chatId, msgId, `❌ ${validation.error}`);
    return;
  }

  // Execute
  const result = await executeSQL(pool, sql);

  await ctx.api.editMessageText(chatId, msgId, "💡 Анализирую данные...");

  // Analyze with AI
  let analysis = "";
  try {
    analysis = await analyzeResults(originalQuestion, result.sql, result.rows, result.fields, result.rowCount, tables);
  } catch {
    // non-critical
  }

  // Delete status message
  try {
    await ctx.api.editMessageText(chatId, msgId, "✅ Готово");
  } catch { /* ignore */ }

  // Send beautiful response
  // Analysis first (main answer)
  if (analysis) {
    const cleanAnalysis = mdToTelegramHtml(analysis);
    await sendSafe(ctx, `💡 <b>Ответ:</b>\n\n${cleanAnalysis}`);
  }

  // Data table
  const formatted = formatTelegram({
    sql: result.sql, rows: result.rows, rowCount: result.rowCount,
    fields: result.fields, executionMs: result.executionMs,
  });
  await sendSafe(ctx, formatted);

  // Chart image (if data is suitable)
  const chart = buildChartConfig(result.fields, result.rows);
  if (chart) {
    try {
      const chartUrl = buildQuickChartUrl(chart);
      console.log("Chart URL length:", chartUrl.length, "type:", chart.type);
      await ctx.api.sendPhoto(chatId, chartUrl);
    } catch (err) {
      console.error("Chart send failed:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("No chart: fields=", result.fields, "rows=", result.rowCount);
  }

  // SQL (collapsed, at the end)
  const sqlBlock = `<blockquote expandable>🔍 SQL:\n<pre>${escapeHtml(result.sql)}</pre></blockquote>`;

  // Save to history with full results
  let historyId: number | undefined;
  try {
    historyId = await saveQueryHistory(appPool, {
      user_id: user.id, platform: "telegram", question: originalQuestion, sql: result.sql,
      row_count: result.rowCount, execution_ms: result.executionMs, error: undefined,
      rows_json: result.rows, fields: result.fields, analysis: analysis || undefined,
      chart_config: chart || undefined,
    });
  } catch { /* ignore */ }

  // Schedule buttons + "Open on web" button
  const hash = storeQuestion(originalQuestion);
  const keyboard = new InlineKeyboard()
    .text("📋 Ежедневно", `sched:daily:${hash}`)
    .text("📋 Еженедельно", `sched:weekly:${hash}`);

  if (historyId) {
    keyboard.row().url("📊 Открыть на сайте", `${webUrl}/?load=${historyId}`);
  }

  await sendSafe(ctx, sqlBlock, keyboard);
}

/** Send message safely, splitting if >4096 chars */
async function sendSafe(
  ctx: { reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown> },
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const opts: Record<string, unknown> = { parse_mode: "HTML" };
  if (keyboard) opts.reply_markup = keyboard;

  if (text.length <= 4096) {
    await ctx.reply(text, opts);
    return;
  }

  // Split on newlines, send in chunks
  const lines = text.split("\n");
  let chunk = "";
  for (const line of lines) {
    if (chunk.length + line.length + 1 > 4000) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
      chunk = "";
    }
    chunk += (chunk ? "\n" : "") + line;
  }
  if (chunk) {
    await ctx.reply(chunk, opts);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert markdown-style text to Telegram HTML, handling mixed input */
function mdToTelegramHtml(text: string): string {
  let out = text;
  // Escape HTML entities first (but preserve existing HTML tags from Claude)
  // Check if text already has HTML tags — if so, just clean up markdown remnants
  const hasHtmlTags = /<\/?[bi]>|<\/?code>|<\/?pre>/.test(out);

  if (!hasHtmlTags) {
    // Pure markdown — escape & convert
    out = out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Remove markdown headers (## Header → bold line)
  out = out.replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
  // Bold: **text** or __text__
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.+?)__/g, "<b>$1</b>");
  // Italic: *text* or _text_ (but not inside words)
  out = out.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<i>$1</i>");
  out = out.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<i>$1</i>");
  // Inline code: `text`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bullet points: - text → • text
  out = out.replace(/^[-*]\s+/gm, "• ");

  return out.trim();
}

// ─── Suggestions refresh (hourly + on startup) ───

async function refreshSuggestions() {
  try {
    const { tables } = await getSchema(pool);
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
          console.log("text2SQL bot started (long polling)");

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
