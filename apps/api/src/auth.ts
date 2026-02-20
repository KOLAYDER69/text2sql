import { SignJWT, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = "qb_session";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production-64chars!!!!",
);

export type SessionPayload = {
  userId: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  role: "admin" | "user";
};

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function getSessionFromReq(
  req: Request,
): Promise<SessionPayload | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await getSessionFromReq(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { session: SessionPayload }).session = session;
  next();
}
