import { NextResponse } from "next/server";
import { createPool, query } from "@querybot/engine";
import type pg from "pg";

let pool: pg.Pool | null = null;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    pool = createPool(databaseUrl);
  }
  return pool;
}

export async function POST(request: Request) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }

    const result = await query(getPool(), question.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
