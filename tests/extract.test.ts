import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractTextFromUpload,
  UnsupportedFileTypeError,
} from "@/lib/rag/extract";

// Fixtures are minimal hand-built files (see git history for the
// generator) so these tests need no network, API key, or database.
const fixture = (name: string) =>
  readFile(path.join(process.cwd(), "tests/fixtures", name));

describe("extractTextFromUpload", () => {
  it("passes markdown/plain text through as utf8", async () => {
    const text = await extractTextFromUpload(
      "notes.md",
      Buffer.from("# Heading\n\nBody text."),
    );
    expect(text).toContain("Body text.");
  });

  it("extracts text from a PDF", async () => {
    const text = await extractTextFromUpload(
      "sample-job.pdf",
      await fixture("sample-job.pdf"),
    );
    expect(text).toContain("Data Engineer");
    expect(text).toContain("Airflow");
  });

  it("extracts text from a DOCX", async () => {
    const text = await extractTextFromUpload(
      "sample-job.docx",
      await fixture("sample-job.docx"),
    );
    expect(text).toContain("Security Engineer");
    expect(text).toContain("incident response");
  });

  it("rejects unsupported extensions", async () => {
    await expect(
      extractTextFromUpload("photo.png", Buffer.from("...")),
    ).rejects.toThrow(UnsupportedFileTypeError);
  });
});
