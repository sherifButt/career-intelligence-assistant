import { NextRequest, NextResponse } from "next/server";
import {
  extractTextFromUpload,
  UnsupportedFileTypeError,
} from "@/lib/rag/extract";
import { ingestDocument } from "@/lib/rag/ingest";

// Two ways in, one pipeline: JSON with pre-extracted text (seed script,
// programmatic use) or multipart/form-data with a raw file (the upload
// dialog) — pdf/docx extraction happens here on the server.

// Raw upload cap. Text length is capped separately after extraction.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CONTENT_CHARS = 200_000;

interface ParsedIngest {
  name: string;
  docType: string;
  content: string;
}

export async function POST(req: NextRequest) {
  let parsed: ParsedIngest | NextResponse;
  try {
    parsed = req.headers.get("content-type")?.startsWith("multipart/form-data")
      ? await parseMultipart(req)
      : await parseJson(req);
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[ingest] failed to parse request:", err);
    return NextResponse.json(
      { error: "Could not read the uploaded document" },
      { status: 400 },
    );
  }
  if (parsed instanceof NextResponse) return parsed;
  const { name, docType, content } = parsed;

  if (!name.trim()) {
    return NextResponse.json({ error: "`name` is required" }, { status: 400 });
  }
  if (docType !== "resume" && docType !== "job") {
    return NextResponse.json(
      { error: '`docType` must be "resume" or "job"' },
      { status: 400 },
    );
  }
  if (!content.trim()) {
    return NextResponse.json(
      {
        error: `No extractable text found in "${name}" — is it a scanned document?`,
      },
      { status: 400 },
    );
  }
  // The server pays the embedding bill, so it enforces the limit — the
  // client-side check is just faster feedback.
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: "`content` is too large (max 200k characters)" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestDocument({
      name: name.trim(),
      docType,
      content,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ingest] failed:", err);
    const message = err instanceof Error ? err.message : "Ingestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function parseJson(req: NextRequest): Promise<ParsedIngest | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, docType, content } = (body ?? {}) as Record<string, unknown>;
  return {
    name: typeof name === "string" ? name : "",
    docType: typeof docType === "string" ? docType : "",
    content: typeof content === "string" ? content : "",
  };
}

async function parseMultipart(
  req: NextRequest,
): Promise<ParsedIngest | NextResponse> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "multipart requests need a `file` field" },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 10 MB)" },
      { status: 400 },
    );
  }
  const name = form.get("name");
  const docType = form.get("docType");
  const content = await extractTextFromUpload(
    file.name,
    Buffer.from(await file.arrayBuffer()),
  );
  return {
    name: typeof name === "string" && name.trim() ? name : file.name,
    docType: typeof docType === "string" ? docType : "",
    content,
  };
}
