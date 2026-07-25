import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { documents, getDb } from "@/lib/db";

// Removes a document and (via ON DELETE CASCADE) all its chunks — the
// other half of corpus management next to upload.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json(
      { error: "Document id must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(documents)
      .where(eq(documents.id, docId))
      .returning({ id: documents.id, name: documents.name });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: deleted[0] });
  } catch (err) {
    console.error("[documents] delete failed:", err);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
