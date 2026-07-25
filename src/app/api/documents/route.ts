import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { chunks, documents, getDb } from "@/lib/db";

// Backs the context panel: which documents are in the corpus, how many
// chunks each contributed, roughly how big they are, and when they were
// ingested — makes the retrieval corpus visible at a glance.
export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: documents.id,
        name: documents.name,
        docType: documents.docType,
        chunkCount: count(chunks.id),
        // Extracted-text size (summed chunk chars, so slightly over via
        // overlap) — close enough for a "4.2 KB" display label.
        sizeBytes: sql<number>`coalesce(sum(length(${chunks.content})), 0)`,
        createdAt: documents.createdAt,
        analysis: documents.analysis,
      })
      .from(documents)
      .leftJoin(chunks, eq(chunks.documentId, documents.id))
      .groupBy(documents.id)
      .orderBy(documents.name);

    return NextResponse.json({ documents: rows });
  } catch (err) {
    console.error("[documents] failed:", err);
    return NextResponse.json(
      { error: "Failed to load documents — is the database running?" },
      { status: 500 },
    );
  }
}
