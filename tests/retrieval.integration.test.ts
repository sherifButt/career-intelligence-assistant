import "dotenv/config";
import { describe, expect, it } from "vitest";
import { listJobDocuments, retrieve } from "@/lib/rag/retrieve";

// Integration test: needs the docker postgres up, the corpus seeded, and an
// OpenAI key (it embeds two queries, ~$0.000001). Skips itself cleanly when
// the environment isn't there so `pnpm test` never fails on a fresh clone.
const hasEnv = Boolean(process.env.DATABASE_URL && process.env.OPENAI_API_KEY);

describe.skipIf(!hasEnv)("retrieve (integration)", () => {
  it("scores an on-topic query higher than an off-topic one", async () => {
    const relevant = await retrieve(
      "What TypeScript and LLM experience does the candidate have?",
      { k: 3 },
    );
    const irrelevant = await retrieve(
      "What is a good recipe for chocolate cake?",
      { k: 3 },
    );

    expect(relevant.length).toBeGreaterThan(0);
    const bestRelevant = Math.max(...relevant.map((c) => c.score));
    const bestIrrelevant = Math.max(...irrelevant.map((c) => c.score));

    expect(bestRelevant).toBeGreaterThan(bestIrrelevant);
    // The off-topic query should also fall below the guardrail threshold —
    // this is the score gap the refusal behaviour relies on.
    expect(bestIrrelevant).toBeLessThan(0.25);
  }, 30_000);

  it("respects the docType filter", async () => {
    const jobsOnly = await retrieve("required skills for the role", {
      docType: "job",
      k: 5,
    });
    expect(jobsOnly.length).toBeGreaterThan(0);
    expect(jobsOnly.every((c) => c.docType === "job")).toBe(true);
  }, 30_000);

  it("scopes retrieval to a single document", async () => {
    const [job] = await listJobDocuments();
    expect(job).toBeDefined();

    const scoped = await retrieve("required skills for the role", {
      documentId: job.id,
      k: 5,
    });
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((c) => c.documentName === job.name)).toBe(true);
  }, 30_000);
});
