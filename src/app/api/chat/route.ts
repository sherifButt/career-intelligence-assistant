import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLlmProvider } from "@/lib/llm/provider";
import { estimateCostUSD } from "@/lib/observability/cost";
import { logQuery } from "@/lib/observability/log";
import { embedQuery } from "@/lib/rag/embed";
import { REFUSAL_MESSAGE, shouldRefuse } from "@/lib/rag/guardrail";
import { buildGroundedPrompt } from "@/lib/rag/prompt";
import { listJobDocuments, retrieveByEmbedding } from "@/lib/rag/retrieve";
import type { ChatResponse, ChatSource } from "@/lib/types";

// Every question this app exists for compares the résumé against jobs, so a
// single global top-k risks returning one side only (the query "my
// experience..." is naturally closer to CV text). Instead we retrieve the
// top chunks from each side with one query embedding.
//
// The job side is budgeted PER JOB, not globally: a global top-k lets the
// most similar posting monopolise every slot once JDs span multiple chunks,
// so comparative answers would silently ignore some jobs. When the client
// scopes the question to one job (jobDocumentId), that job gets the whole
// budget instead.
const RESUME_K = 4;
const PER_JOB_K = 2;
const SCOPED_JOB_K = 4;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question, jobDocumentId } = (body ?? {}) as Record<string, unknown>;
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "`question` must be a non-empty string" },
      { status: 400 },
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "`question` is too long (max 2000 chars)" },
      { status: 400 },
    );
  }
  if (
    jobDocumentId !== undefined &&
    (typeof jobDocumentId !== "number" || !Number.isInteger(jobDocumentId))
  ) {
    return NextResponse.json(
      { error: "`jobDocumentId` must be an integer document id" },
      { status: 400 },
    );
  }

  const queryId = randomUUID();
  const startedAt = Date.now();
  const trimmed = question.trim();

  try {
    const jobDocs = await listJobDocuments();
    if (jobDocumentId !== undefined && !jobDocs.some((d) => d.id === jobDocumentId)) {
      return NextResponse.json(
        { error: "`jobDocumentId` does not match a job document" },
        { status: 400 },
      );
    }

    const queryEmbedding = await embedQuery(trimmed);
    const [resumeChunks, ...perJobChunks] = await Promise.all([
      retrieveByEmbedding(queryEmbedding, { docType: "resume", k: RESUME_K }),
      ...(jobDocumentId !== undefined
        ? [
            retrieveByEmbedding(queryEmbedding, {
              documentId: jobDocumentId,
              k: SCOPED_JOB_K,
            }),
          ]
        : jobDocs.map((d) =>
            retrieveByEmbedding(queryEmbedding, {
              documentId: d.id,
              k: PER_JOB_K,
            }),
          )),
    ]);
    const retrieved = [...resumeChunks, ...perJobChunks.flat()];

    if (retrieved.length === 0) {
      return NextResponse.json(
        { error: "No documents ingested yet — run `pnpm seed` first" },
        { status: 409 },
      );
    }

    const sources: ChatSource[] = retrieved.map((c, i) => ({
      label: `S${i + 1}`,
      documentName: c.documentName,
      docType: c.docType,
      chunkIndex: c.chunkIndex,
      content: c.content,
      score: c.score,
    }));

    // Guardrail: weak retrieval → refuse before spending LLM tokens. The
    // sources (with their low scores) are still returned so the refusal is
    // inspectable, not a black box.
    if (shouldRefuse(retrieved)) {
      const response: ChatResponse = {
        answer: REFUSAL_MESSAGE,
        sources,
        guardrailTriggered: true,
        latencyMs: Date.now() - startedAt,
        tokenUsage: { input: 0, output: 0 },
        estimatedCostUSD: 0,
      };
      logQuery({
        queryId,
        question: trimmed,
        retrievalScores: retrieved.map((c) => c.score),
        guardrailTriggered: true,
        latencyMs: response.latencyMs,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCostUSD: 0,
        model: "none",
      });
      return NextResponse.json(response);
    }

    const prompt = buildGroundedPrompt(trimmed, retrieved);
    const completion = await getLlmProvider().complete([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);

    // Chat-model cost only; the query-embedding cost is ~1000x smaller and
    // would show as $0.0000 anyway.
    const estimatedCost = estimateCostUSD(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );

    const response: ChatResponse = {
      answer: completion.text,
      sources,
      guardrailTriggered: false,
      latencyMs: Date.now() - startedAt,
      tokenUsage: { input: completion.tokensIn, output: completion.tokensOut },
      estimatedCostUSD: estimatedCost,
    };
    logQuery({
      queryId,
      question: trimmed,
      retrievalScores: retrieved.map((c) => c.score),
      guardrailTriggered: false,
      latencyMs: response.latencyMs,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
      estimatedCostUSD: estimatedCost,
      model: completion.model,
    });
    return NextResponse.json(response);
  } catch (err) {
    console.error("[chat] failed:", err);
    const message = err instanceof Error ? err.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
