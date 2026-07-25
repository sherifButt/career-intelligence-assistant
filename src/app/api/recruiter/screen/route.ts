import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  MAX_RESUMES_PER_SCREEN,
  getSessionJobId,
  purgeExpiredSessions,
  screenResumes,
} from "@/lib/rag/screen";
import { attachSession, ensureSession } from "@/lib/session";

const MAX_CHARS = 200_000;

// Recruiter mode: screen up to MAX_RESUMES_PER_SCREEN candidate résumés against
// one pasted job. Expensive (per-résumé gpt-4o judge), so a tight per-IP quota.
export async function POST(req: NextRequest) {
  const limit = rateLimit(`screen:${clientIp(req)}`, 8, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit reached — try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { jobText, resumes } = (body ?? {}) as Record<string, unknown>;

  if (typeof jobText !== "string" || jobText.trim().length < 30) {
    return NextResponse.json(
      { error: "`jobText` must be a job description (min 30 chars)" },
      { status: 400 },
    );
  }
  if (!Array.isArray(resumes) || resumes.length === 0) {
    return NextResponse.json(
      { error: "`resumes` must be a non-empty array" },
      { status: 400 },
    );
  }
  if (resumes.length > MAX_RESUMES_PER_SCREEN) {
    return NextResponse.json(
      { error: `Max ${MAX_RESUMES_PER_SCREEN} résumés per screen` },
      { status: 400 },
    );
  }

  const clean = (resumes as unknown[])
    .map((r) => r as Record<string, unknown>)
    .filter(
      (r) =>
        typeof r.name === "string" &&
        typeof r.content === "string" &&
        (r.content as string).trim().length > 0,
    )
    .map((r) => ({
      name: (r.name as string).slice(0, 200),
      content: (r.content as string).slice(0, MAX_CHARS),
    }));
  if (clean.length === 0) {
    return NextResponse.json(
      { error: "Each résumé needs a name and non-empty content" },
      { status: 400 },
    );
  }

  const session = ensureSession(req);
  try {
    await purgeExpiredSessions();
    const candidates = await screenResumes(
      session.id,
      jobText.slice(0, MAX_CHARS),
      clean,
    );
    const jobId = await getSessionJobId(session.id);
    const res = NextResponse.json({ jobId, candidates });
    return session.isNew ? attachSession(res, session.id) : res;
  } catch (err) {
    console.error("[recruiter/screen] failed:", err);
    const message = err instanceof Error ? err.message : "Screening failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
