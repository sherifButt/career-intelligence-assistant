import { describe, expect, it } from "vitest";
import type { RetrievedChunk } from "@/lib/types";
import { shouldRefuse } from "./guardrail";

const chunk = (score: number): RetrievedChunk => ({
  chunkId: 1,
  documentName: "cv.md",
  docType: "resume",
  chunkIndex: 0,
  content: "…",
  score,
});

describe("shouldRefuse", () => {
  it("refuses when nothing was retrieved", () => {
    expect(shouldRefuse([], 0.25)).toBe(true);
  });

  it("refuses when every chunk scores below the threshold", () => {
    expect(shouldRefuse([chunk(0.1), chunk(0.18), chunk(0.22)], 0.25)).toBe(
      true,
    );
  });

  it("answers when at least one chunk clears the threshold", () => {
    // One strong hit is enough — a fit question about Job #2 legitimately
    // retrieves weak resume chunks alongside one strong job chunk.
    expect(shouldRefuse([chunk(0.1), chunk(0.45)], 0.25)).toBe(false);
  });
});
