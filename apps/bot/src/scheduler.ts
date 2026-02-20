import { Cron } from "croner";
import type { Bot } from "grammy";
import type { Pool } from "pg";
import {
  getActiveSchedules,
  updateScheduleRun,
} from "@querybot/engine";
import { query, formatTelegram } from "@querybot/engine";

const jobs = new Map<number, Cron>();

export async function initScheduler(
  bot: Bot,
  appPool: Pool,
  readPool: Pool,
): Promise<void> {
  const schedules = await getActiveSchedules(appPool);

  for (const schedule of schedules) {
    registerJob(bot, appPool, readPool, schedule.id, schedule.cron_expr, {
      telegramId: schedule.telegram_id,
      question: schedule.question,
    });
  }

  console.log(`Scheduler: loaded ${schedules.length} active schedules`);
}

export function registerJob(
  bot: Bot,
  appPool: Pool,
  readPool: Pool,
  scheduleId: number,
  cronExpr: string,
  opts: { telegramId: string; question: string },
): void {
  // Cancel existing job if any
  cancelJob(scheduleId);

  const job = new Cron(cronExpr, async () => {
    try {
      const result = await query(readPool, opts.question);

      if (result.error) {
        await updateScheduleRun(appPool, scheduleId, result.error);
        await bot.api.sendMessage(
          opts.telegramId,
          `📋 <b>Расписание:</b> ${escapeHtml(opts.question)}\n\n❌ ${escapeHtml(result.error)}`,
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

      const message =
        `📋 <b>Расписание:</b> ${escapeHtml(opts.question)}\n\n` +
        `<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>\n\n` +
        `<b>Результат:</b>\n${formatted}`;

      if (message.length > 4096) {
        await bot.api.sendMessage(
          opts.telegramId,
          `📋 <b>Расписание:</b> ${escapeHtml(opts.question)}\n\n<b>SQL:</b>\n<pre>${escapeHtml(result.sql)}</pre>`,
          { parse_mode: "HTML" },
        );
        await bot.api.sendMessage(opts.telegramId, formatted, {
          parse_mode: "HTML",
        });
      } else {
        await bot.api.sendMessage(opts.telegramId, message, {
          parse_mode: "HTML",
        });
      }

      await updateScheduleRun(appPool, scheduleId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await updateScheduleRun(appPool, scheduleId, errorMsg);
    }
  });

  jobs.set(scheduleId, job);
}

export function cancelJob(scheduleId: number): void {
  const existing = jobs.get(scheduleId);
  if (existing) {
    existing.stop();
    jobs.delete(scheduleId);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
