import { NextResponse } from "next/server";
import {
  verifyTelegramLogin,
  type TelegramLoginData,
} from "@/lib/telegram-auth";
import { createSession, getSessionCookieName } from "@/lib/auth";
import {
  createAppPool,
  findUserByTelegramId,
  createUser,
  updateLastSeen,
  findInviteByCode,
  useInvite,
} from "@querybot/engine";
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inviteCode, ...telegramData } = body as TelegramLoginData & {
      inviteCode?: string;
    };

    // Verify Telegram login
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 },
      );
    }

    if (!verifyTelegramLogin(telegramData, botToken)) {
      return NextResponse.json(
        { error: "Invalid Telegram auth data" },
        { status: 401 },
      );
    }

    const pool = getAppPool();

    // Lookup user
    let user = await findUserByTelegramId(pool, telegramData.id);

    if (!user) {
      // New user — need a valid invite code
      if (!inviteCode) {
        return NextResponse.json(
          { error: "no_account" },
          { status: 403 },
        );
      }

      const invite = await findInviteByCode(pool, inviteCode);
      if (
        !invite ||
        invite.used_by !== null ||
        (invite.expires_at && new Date(invite.expires_at) < new Date())
      ) {
        return NextResponse.json(
          { error: "invalid_invite" },
          { status: 403 },
        );
      }

      // Create user
      user = await createUser(pool, {
        telegram_id: telegramData.id,
        username: telegramData.username,
        first_name: telegramData.first_name,
        last_name: telegramData.last_name,
        invited_by: invite.created_by,
      });

      // Mark invite as used
      await useInvite(pool, invite.id, user.id);
    } else {
      // Update last seen
      await updateLastSeen(pool, user.id);
    }

    // Create JWT session
    const token = await createSession({
      userId: user.id,
      telegramId: Number(user.telegram_id),
      username: user.username,
      firstName: user.first_name,
      role: user.role,
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        role: user.role,
      },
    });

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
