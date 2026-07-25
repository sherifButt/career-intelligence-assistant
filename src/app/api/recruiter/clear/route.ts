import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/rag/screen";
import { readSession } from "@/lib/session";

// Wipe the current recruiter session (candidates + req) and drop the cookie.
export async function POST(req: NextRequest) {
  const sessionId = readSession(req);
  try {
    if (sessionId) await clearSession(sessionId);
  } catch (err) {
    console.error("[recruiter/clear] failed:", err);
    return NextResponse.json({ error: "Failed to clear session" }, { status: 500 });
  }
  const res = NextResponse.json({ cleared: true });
  res.cookies.delete("ci_session");
  return res;
}
