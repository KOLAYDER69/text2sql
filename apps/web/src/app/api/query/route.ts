import { NextResponse } from "next/server";
import { createPool, createAppPool, query, saveQueryHistory } from "@querybot/engine";
import { getSession } from "@/lib/auth";
import type pg from "pg";

let pool: pg.Pool | null = null;
let appPool: pg.Pool | null = null;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    pool = createPool(databaseUrl);
  }
  return pool;
}

function getAppPool() {
  if (!appPool) {
    const url = process.env.APP_DATABASE_URL;
    if (!url) throw new Error("APP_DATABASE_URL is required");
    appPool = createAppPool(url);
  }
  return appPool;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { question } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }

    const result = await query(getPool(), question.trim());

    // Save to history (fire-and-forget)
    saveQueryHistory(getAppPool(), {
      user_id: session.userId,
      platform: "web",
      question: question.trim(),
      sql: result.sql,
      row_count: result.rowCount,
      execution_ms: result.executionMs,
      error: result.error,
    }).catch((err) => console.error("Failed to save history:", err));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
