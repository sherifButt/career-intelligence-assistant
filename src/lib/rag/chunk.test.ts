import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

const paragraph = (label: string) =>
  `${label}: ${"lorem ipsum dolor sit amet ".repeat(10).trim()}.`;

describe("chunkText", () => {
  it("returns empty for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const text = "One paragraph.\n\nAnother paragraph.";
    expect(chunkText(text)).toEqual([text]);
  });

  it("splits long documents into chunks within the size budget", () => {
    const text = Array.from({ length: 30 }, (_, i) => paragraph(`P${i}`)).join(
      "\n\n",
    );
    const maxChars = 1000;
    const parts = chunkText(text, { maxChars, overlapChars: 150 });

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      // Small tolerance: a chunk can exceed the budget by one overlap tail.
      expect(part.length).toBeLessThanOrEqual(maxChars + 150);
    }
    // Nothing lost: every paragraph appears in some chunk.
    for (let i = 0; i < 30; i++) {
      expect(parts.some((p) => p.includes(`P${i}:`))).toBe(true);
    }
  });

  it("carries overlap across chunk boundaries", () => {
    const text = Array.from({ length: 10 }, (_, i) => paragraph(`P${i}`)).join(
      "\n\n",
    );
    const overlapChars = 150;
    const parts = chunkText(text, { maxChars: 800, overlapChars });

    expect(parts.length).toBeGreaterThan(1);
    for (let i = 1; i < parts.length; i++) {
      // The head of each chunk (past its overlap region) must repeat text
      // from the tail of the previous chunk.
      const head = parts[i].slice(0, overlapChars);
      const prevTail = parts[i - 1].slice(-overlapChars * 2);
      const headStart = head.slice(0, 40);
      expect(prevTail).toContain(headStart);
    }
  });

  it("splits a single oversized paragraph by sentence", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} here.`).join(
      " ",
    );
    const parts = chunkText(text, { maxChars: 200, overlapChars: 30 });
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(230);
    }
  });
});
