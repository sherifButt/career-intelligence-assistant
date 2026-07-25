import type { RetrievedChunk } from "@/lib/types";

// Refuse when even the best-matching chunk is barely related to the
// question. 0.25 was picked empirically against this corpus: on-topic
// questions score 0.3–0.6 on their best chunk with text-embedding-3-small,
// while off-topic ones ("chocolate cake recipe") land under 0.2.
// Tunable via env so re-calibrating for a new corpus needs no code change.
export const RETRIEVAL_SCORE_THRESHOLD = Number(
  process.env.RETRIEVAL_SCORE_THRESHOLD ?? 0.25,
);

export const REFUSAL_MESSAGE =
  "I don't have enough context in the provided documents to answer that confidently. Try asking about the résumé, the job descriptions, or how they compare.";

// Pure function (no I/O) so the guardrail is unit-testable without a
// database or API key.
export function shouldRefuse(
  retrieved: RetrievedChunk[],
  threshold: number = RETRIEVAL_SCORE_THRESHOLD,
): boolean {
  if (retrieved.length === 0) return true;
  const best = Math.max(...retrieved.map((c) => c.score));
  return best < threshold;
}
