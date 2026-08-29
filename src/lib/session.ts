import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// Opaque recruiter-session token, kept in an httpOnly cookie. Recruiter-mode
// uploads are scoped to it and auto-purged, so candidate PII never mixes into
// the shared corpus or outlives the session.
const COOKIE = "ci_session";
const MAX_AGE_SEC = 60 * 60 * 24; // matches the 24h server-side purge

export function readSession(req: NextRequest): string | null {
  return req.cookies.get(COOKIE)?.value ?? null;
}

/** Existing session id, or a freshly minted one (mark it new so the route can
 *  set the cookie on the response). */
export function ensureSession(req: NextRequest): {
  id: string;
  isNew: boolean;
} {
  const existing = readSession(req);
  if (existing) return { id: existing, isNew: false };
  return { id: randomUUID(), isNew: true };
}

export function attachSession(res: NextResponse, id: string): NextResponse {
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return res;
}
