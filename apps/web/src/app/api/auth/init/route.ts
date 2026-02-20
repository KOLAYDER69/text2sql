import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAppPool, createAuthToken } from "@querybot/engine";
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

export async function POST() {
  const token = crypto.randomBytes(16).toString("hex");
  await createAuthToken(getAppPool(), token);

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "leadsaibot";
  const telegramUrl = `https://t.me/${botName}?start=auth_${token}`;

  return NextResponse.json({ token, telegramUrl });
}
