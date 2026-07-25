import { and, eq, isNotNull, lt } from "drizzle-orm";
import { documents, getDb, type JobAnalysis } from "@/lib/db";
import { getResumeText, screenFit } from "./analyze";
import { ingestDocument } from "./ingest";

// Recruiter mode: screen N candidate résumés against ONE job (the mirror of
// the job-seeker flow). Candidate uploads are scoped to an ephemeral session
// and auto-purged — never mixed into the shared corpus.

/** Balanced self-consistency for bulk screening: median-of-2 keeps most of the
 *  stability at 2/3 the cost of the job-seeker median-of-3. */
const BULK_SAMPLES = 2;
export const MAX_RESUMES_PER_SCREEN = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// A stable, session-scoped name for the pasted req so re-screening replaces it.
const REQ_DOC = "__req__";

export interface Candidate {
  documentId: number;
  name: string;
  analysis: JobAnalysis | null;
}

// Session docs are namespaced by session id to stay globally unique and to
// dedup within a session (ingestDocument replaces same (name, session)).
function sessionName(sessionId: string, name: string): string {
  return `${sessionId}/${name}`;
}
function displayName(sessionId: string, stored: string): string {
  const prefix = `${sessionId}/`;
  return stored.startsWith(prefix) ? stored.slice(prefix.length) : stored;
}

function rank(a: Candidate, b: Candidate): number {
  return (b.analysis?.matchScore ?? -1) - (a.analysis?.matchScore ?? -1);
}

/** Delete session docs older than the TTL (chunks cascade). Opportunistic —
 *  called at the top of recruiter requests. */
export async function purgeExpiredSessions(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  await db
    .delete(documents)
    .where(and(isNotNull(documents.sessionId), lt(documents.createdAt, cutoff)));
}

/** Ingest the pasted req as a session-scoped job doc (replacing any prior one
 *  for this session) and return its id. */
async function ensureSessionJob(
  sessionId: string,
  jobText: string,
): Promise<number> {
  const res = await ingestDocument({
    name: sessionName(sessionId, REQ_DOC),
    docType: "job",
    content: jobText,
    sessionId,
  });
  return res.documentId;
}

/** Ingest + screen each résumé against the req, store the analysis on the
 *  candidate row, and return them ranked best-fit first. Sequential to stay
 *  within OpenAI rate limits at bulk. */
export async function screenResumes(
  sessionId: string,
  jobText: string,
  resumes: { name: string; content: string }[],
): Promise<Candidate[]> {
  const db = getDb();
  const jobId = await ensureSessionJob(sessionId, jobText);
  const results: Candidate[] = [];

  for (const r of resumes) {
    const ingest = await ingestDocument({
      name: sessionName(sessionId, r.name),
      docType: "resume",
      content: r.content,
      sessionId,
    });
    let analysis: JobAnalysis | null = null;
    const resumeText = await getResumeText(ingest.documentId);
    if (resumeText) {
      const screen = await screenFit(resumeText, jobText, {
        samples: BULK_SAMPLES,
      });
      if (screen) {
        analysis = { ...screen.analysis, vsJobId: jobId };
        await db
          .update(documents)
          .set({ analysis })
          .where(eq(documents.id, ingest.documentId));
      }
    }
    results.push({ documentId: ingest.documentId, name: r.name, analysis });
  }

  return results.sort(rank);
}

/** The session's candidates (résumé docs) ranked best-fit first. */
export async function listCandidates(sessionId: string): Promise<Candidate[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      analysis: documents.analysis,
    })
    .from(documents)
    .where(
      and(eq(documents.docType, "resume"), eq(documents.sessionId, sessionId)),
    );
  return rows
    .map((r) => ({
      documentId: r.id,
      name: displayName(sessionId, r.name),
      analysis: r.analysis,
    }))
    .sort(rank);
}

/** Wipe everything for a session (candidates + req). */
export async function clearSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(documents).where(eq(documents.sessionId, sessionId));
}

/** The session's req job-document id, if screened (used to scope candidate
 *  chat: résumé = candidate doc, job = this req). */
export async function getSessionJobId(
  sessionId: string,
): Promise<number | null> {
  const db = getDb();
  const [job] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.name, sessionName(sessionId, REQ_DOC)),
        eq(documents.sessionId, sessionId),
      ),
    )
    .limit(1);
  return job?.id ?? null;
}
