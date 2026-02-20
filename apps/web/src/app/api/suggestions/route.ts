import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppPool, getLatestSuggestions } from "@querybot/engine";
import type pg from "pg";

let appPool: pg.Pool | null = null;

function getAppPool() {
  if (!appPool) {
    const url = process.env.APP_DATABASE_URL;
    if (!url) throw new Error("APP_DATABASE_URL is required");
    appPool = createAppPool(url);
  }
  return appPool;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const suggestions = await getLatestSuggestions(getAppPool());

  return NextResponse.json({
    suggestions: suggestions ?? ["Ask any question about your data in natural language"],
  });
}
