import { eq } from "drizzle-orm";
import {
  chunks,
  documents,
  getDb,
  type DocType,
  type JobAnalysis,
} from "@/lib/db";
import { analyzeJobFit } from "./analyze";
import { chunkText } from "./chunk";
import { embedTexts } from "./embed";

export interface IngestInput {
  name: string;
  docType: DocType;
  content: string;
}

export interface IngestResult {
  documentId: number;
  chunkCount: number;
  /** Present for jobs when a résumé exists to compare against. */
  analysis?: JobAnalysis | null;
}

// Re-ingesting a document with the same name replaces it (delete + insert
// inside one transaction). Keeps `pnpm seed` idempotent — no stale chunks
// from a previous run.
export async function ingestDocument({
  name,
  docType,
  content,
}: IngestInput): Promise<IngestResult> {
  const pieces = chunkText(content);
  if (pieces.length === 0) {
    throw new Error(`Document "${name}" has no extractable text`);
  }

  // Embed before opening the transaction — no reason to hold a DB
  // transaction open across network calls to OpenAI.
  const embeddings = await embedTexts(pieces);

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.name, name));
    const [doc] = await tx
      .insert(documents)
      .values({ name, docType })
      .returning({ id: documents.id });

    await tx.insert(chunks).values(
      pieces.map((content, i) => ({
        documentId: doc.id,
        chunkIndex: i,
        content,
        embedding: embeddings[i],
      })),
    );

    return { documentId: doc.id, chunkCount: pieces.length } as IngestResult;
  });

  // Fit analysis happens after the transaction: it's an LLM call, and a
  // failed screen must never roll back a successful ingest.
  try {
    if (docType === "job") {
      result.analysis = await analyzeJobFit(content);
      if (result.analysis) {
        await db
          .update(documents)
          .set({ analysis: result.analysis })
          .where(eq(documents.id, result.documentId));
      }
    } else {
      // A new résumé invalidates every job's screen — refresh them all.
      // Linear in job count; trivial at this corpus size.
      await reanalyzeAllJobs();
    }
  } catch (err) {
    console.error("[ingest] fit analysis failed (non-fatal):", err);
  }

  return result;
}

export async function reanalyzeAllJobs(): Promise<void> {
  const db = getDb();
  const jobs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.docType, "job"));

  for (const job of jobs) {
    const jobChunks = await db
      .select({ content: chunks.content })
      .from(chunks)
      .where(eq(chunks.documentId, job.id))
      .orderBy(chunks.chunkIndex);
    const analysis = await analyzeJobFit(
      jobChunks.map((c) => c.content).join("\n\n"),
    );
    await db.update(documents).set({ analysis }).where(eq(documents.id, job.id));
  }
}
