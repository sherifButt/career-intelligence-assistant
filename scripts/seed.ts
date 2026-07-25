// Ingests every .md/.txt file in /seed. Run with `pnpm seed` (needs the
// docker postgres up and OPENAI_API_KEY in .env).
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { EXTRACTABLE, extractTextFromUpload } from "../src/lib/rag/extract";
import { ingestDocument } from "../src/lib/rag/ingest";
import type { DocType } from "../src/lib/db/schema";

const SEED_DIR = path.join(process.cwd(), "seed");

// Convention over config: a filename containing "cv" or "resume" as a word
// segment (cv-x, Sherif_CV, my resume.pdf) is the résumé, everything else a
// job description.
function inferDocType(filename: string): DocType {
  return /(^|[^a-z])(cv|resume)([^a-z]|$)/i.test(filename) ? "resume" : "job";
}

async function main() {
  const files = (await readdir(SEED_DIR)).filter((f) => EXTRACTABLE.test(f));
  if (files.length === 0) {
    console.error(`No .md/.txt/.pdf/.docx files found in ${SEED_DIR}`);
    process.exit(1);
  }

  for (const file of files.sort()) {
    const raw = await readFile(path.join(SEED_DIR, file));
    const content = await extractTextFromUpload(file, raw);
    const docType = inferDocType(file);
    const { chunkCount } = await ingestDocument({ name: file, docType, content });
    console.log(`✓ ${file} (${docType}) → ${chunkCount} chunks`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
