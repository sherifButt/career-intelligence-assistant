import { NextRequest, NextResponse } from "next/server";
import {
  getSessionJobId,
  listCandidates,
  purgeExpiredSessions,
} from "@/lib/rag/screen";
import { readSession } from "@/lib/session";

// The current recruiter session's ranked candidates (best-fit first), or an
// empty list when there's no session yet.
export async function GET(req: NextRequest) {
  const sessionId = readSession(req);
  if (!sessionId) return NextResponse.json({ jobId: null, candidates: [] });
  try {
    await purgeExpiredSessions();
    const [candidates, jobId] = await Promise.all([
      listCandidates(sessionId),
      getSessionJobId(sessionId),
    ]);
    return NextResponse.json({ jobId, candidates });
  } catch (err) {
    console.error("[recruiter/candidates] failed:", err);
    return NextResponse.json(
      { error: "Failed to load candidates" },
      { status: 500 },
    );
  }
}
