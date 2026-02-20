import { NextResponse } from "next/server";
import { createSession, getSessionCookieName } from "@/lib/auth";
import { createAppPool, checkAuthToken, findUserById } from "@querybot/engine";
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
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const pool = getAppPool();
  const result = await checkAuthToken(pool, token);

  if (!result.authenticated || !result.userId) {
    return NextResponse.json({ authenticated: false });
  }

  const user = await findUserById(pool, result.userId);
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  // Create JWT session
  const jwt = await createSession({
    userId: user.id,
    telegramId: Number(user.telegram_id),
    username: user.username,
    firstName: user.first_name,
    role: user.role,
  });

  const response = NextResponse.json({ authenticated: true });

  response.cookies.set(getSessionCookieName(), jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
