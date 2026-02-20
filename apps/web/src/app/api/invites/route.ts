import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppPool, createInvite, listInvites } from "@querybot/engine";
import crypto from "node:crypto";
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

  const invites = await listInvites(getAppPool(), session.userId);
  return NextResponse.json({ invites });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = crypto.randomBytes(4).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await createInvite(getAppPool(), session.userId, code, expiresAt);

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "leadsaibot";
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "";
  const inviteLink = webUrl ? `${webUrl}/login?invite=${code}` : `/login?invite=${code}`;

  return NextResponse.json({
    invite,
    code,
    inviteLink,
    botCommand: `/join ${code}`,
  });
}
