import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppPool, getQueryHistory } from "@querybot/engine";
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

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);

  const history = await getQueryHistory(getAppPool(), session.userId, limit);
  return NextResponse.json({ history });
}
