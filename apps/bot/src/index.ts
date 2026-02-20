import { Bot } from "grammy";
import {
  createPool,
  query,
  getSchema,
  formatTelegram,
} from "@querybot/engine";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_CHAT_ID;
const databaseUrl = process.env.DATABASE_URL;

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = createPool(databaseUrl);
const bot = new Bot(token);

// Access control middleware
bot.use(async (ctx, next) => {
  if (allowedChatId && String(ctx.chat?.id) !== allowedChatId) {
    await ctx.reply("⛔ Доступ запрещён.");
    return;
  }
  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Привет! Я QueryBot — задай вопрос о данных на естественном языке, и я выполню SQL-запрос.\n\n" +
      "Примеры:\n" +
      "• Покажи топ-5 товаров по цене\n" +
      "• Сколько заказов в каждом статусе?\n" +
      "• Какой средний чек по городам?\n\n" +
      "/schema — показать схему БД\n" +
      "/help — помощь",
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "Просто напиши вопрос на русском или английском — я преобразую его в SQL и покажу результат.\n\n" +
      "⚠️ Только чтение (SELECT). Модификация данных невозможна.\n\n" +
      "Команды:\n" +
      "/start — приветствие\n" +
      "/schema — схема базы данных\n" +
      "/help — эта справка",
  );
});

bot.command("schema", async (ctx) => {
  try {
    const tables = await getSchema(pool);
    const text = tables
      .map(
        (t) =>
          `<b>${t.name}</b>\n` +
          t.columns.map((c) => `  ${c.column_name} <i>${c.data_type}</i>`).join("\n"),
      )
      .join("\n\n");
    await ctx.reply(text, { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply("❌ Ошибка получения схемы: " + (err instanceof Error ? err.message : "Unknown"));
  }
});

// Handle text messages — run query pipeline
bot.on("message:text", async (ctx) => {
  const question = ctx.message.text;

  await ctx.reply("⏳ Выполняю запрос...");

  try {
    const result = await query(pool, question);

    if (result.error) {
      await ctx.reply(`❌ ${result.error}\n\n<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>`, {
        parse_mode: "HTML",
      });
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
      await ctx.reply(`<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>`, {
        parse_mode: "HTML",
      });
      await ctx.reply(formatted, { parse_mode: "HTML" });
    } else {
      await ctx.reply(message, { parse_mode: "HTML" });
    }
  } catch (err) {
    await ctx.reply("❌ Ошибка: " + (err instanceof Error ? err.message : "Unknown"));
  }
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Start bot
bot.start({
  onStart: () => console.log("QueryBot started (long polling)"),
});
