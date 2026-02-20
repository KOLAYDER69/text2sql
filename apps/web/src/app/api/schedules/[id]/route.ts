import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppPool, deactivateSchedule } from "@querybot/engine";
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const scheduleId = parseInt(id, 10);
  if (isNaN(scheduleId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const ok = await deactivateSchedule(getAppPool(), scheduleId, session.userId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
