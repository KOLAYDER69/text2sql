import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createAppPool,
  createPool,
  query,
  getUserSchedules,
  createSchedule,
} from "@querybot/engine";
import type pg from "pg";

let appPool: pg.Pool | null = null;
let readPool: pg.Pool | null = null;

function getAppPool() {
  if (!appPool) {
    const url = process.env.APP_DATABASE_URL;
    if (!url) throw new Error("APP_DATABASE_URL is required");
    appPool = createAppPool(url);
  }
  return appPool;
}

function getReadPool() {
  if (!readPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    readPool = createPool(url);
  }
  return readPool;
}

const CRON_PRESETS: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await getUserSchedules(getAppPool(), session.userId);
  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { question, interval, label } = body as {
    question: string;
    interval: string;
    label?: string;
  };

  if (!question || !interval) {
    return NextResponse.json(
      { error: "question and interval are required" },
      { status: 400 },
    );
  }

  const cronExpr = CRON_PRESETS[interval] || interval;

  // Validate by running the query first
  const result = await query(getReadPool(), question);
  if (result.error) {
    return NextResponse.json(
      { error: `Запрос с ошибкой: ${result.error}` },
      { status: 400 },
    );
  }

  const schedule = await createSchedule(getAppPool(), {
    user_id: session.userId,
    question,
    sql: result.sql,
    cron_expr: cronExpr,
    label: label || null,
  });

  return NextResponse.json({ schedule });
}
