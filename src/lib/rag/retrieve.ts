import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { chunks, documents, getDb, type DocType } from "@/lib/db";
import type { RetrievedChunk } from "@/lib/types";
import { embedQuery } from "./embed";

export interface RetrieveOptions {
  docType?: DocType;
  /** Restrict the search to a single document (e.g. one job posting). */
  documentId?: number;
  k?: number;
}

// Top-k cosine similarity over pgvector, optionally filtered by doc type
// and/or a single document. Scores are returned (not just used for
// ordering) so the API can expose them and the guardrail can threshold on
// them.
export async function retrieve(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);
  return retrieveByEmbedding(queryEmbedding, options);
}

// Split out so one query embedding can serve several filtered searches
// (the chat route searches the resume plus every job with a single
// embedding call).
export async function retrieveByEmbedding(
  queryEmbedding: number[],
  { docType, documentId, k = 6 }: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const db = getDb();
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;

  const rows = await db
    .select({
      chunkId: chunks.id,
      documentName: documents.name,
      docType: documents.docType,
      chunkIndex: chunks.chunkIndex,
      content: chunks.content,
      score: similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(
      and(
        docType ? eq(documents.docType, docType) : undefined,
        documentId ? eq(chunks.documentId, documentId) : undefined,
      ),
    )
    .orderBy((t) => desc(t.score))
    .limit(k);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

// The job list drives per-job retrieval fan-out and jobDocumentId
// validation in the chat route.
export async function listJobDocuments(): Promise<
  { id: number; name: string }[]
> {
  const db = getDb();
  return db
    .select({ id: documents.id, name: documents.name })
    .from(documents)
    .where(eq(documents.docType, "job"))
    .orderBy(documents.name);
}
