import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createPool, getSchema, generateSuggestions } from "@querybot/engine";
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

// Cache suggestions for 30 minutes
let cachedSuggestions: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cachedSuggestions && Date.now() - cachedAt < CACHE_TTL) {
    return NextResponse.json({ suggestions: cachedSuggestions });
  }

  try {
    const tables = await getSchema(getPool());
    const suggestions = await generateSuggestions(tables);
    cachedSuggestions = suggestions;
    cachedAt = Date.now();
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({
      suggestions: [
        "Покажи топ-5 товаров по цене",
        "Сколько заказов в каждом статусе?",
        "Какой средний чек по городам?",
        "Покажи последние 10 заказов",
        "Какие товары заканчиваются на складе?",
      ],
    });
  }
}
