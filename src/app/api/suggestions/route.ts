import { NextRequest, NextResponse } from "next/server";
import { documents, getDb } from "@/lib/db";
import { getLlmProvider } from "@/lib/llm/provider";
import { estimateCostUSD } from "@/lib/observability/cost";

// Predicts the next questions worth asking, given the last exchange. Called
// by the client AFTER an answer renders (fire-and-forget), so it never adds
// latency to the answer itself. Costs a fraction of the main query
// (~500 tokens in / ~80 out with gpt-4o-mini).

const SYSTEM_PROMPT = `You suggest follow-up questions for a career intelligence assistant that compares a candidate's résumé against job descriptions (fit, skill gaps, alignment, interview prep).

Given the last question, the assistant's answer, and the documents available, propose exactly 4 follow-up questions the candidate would most plausibly want to ask next.

Rules:
- Written in the candidate's voice ("What should I…", "How does my…").
- Each under 90 characters, no numbering, no quotes.
- Distinct directions: e.g. dig deeper into a gap just mentioned, compare a different job, move toward interview prep or evidence — not four rephrasings.
- Only questions answerable from the listed documents. Never invent other companies or roles.
- Return ONLY a JSON array of 4 strings. No prose, no markdown fence.`;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { question, answer } = (body ?? {}) as Record<string, unknown>;
  if (typeof question !== "string" || typeof answer !== "string" || !answer.trim()) {
    return NextResponse.json(
      { error: "`question` and `answer` are required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const docs = await db
      .select({ name: documents.name, docType: documents.docType })
      .from(documents)
      .orderBy(documents.name);

    const user = [
      `Documents available:`,
      ...docs.map((d) => `- ${d.name} (${d.docType})`),
      ``,
      `Last question: ${question}`,
      ``,
      `Answer given:\n${answer.slice(0, 3000)}`,
    ].join("\n");

    const completion = await getLlmProvider().complete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ]);

    const suggestions = parseSuggestions(completion.text);
    const estimatedCostUSD = estimateCostUSD(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    console.log(
      JSON.stringify({
        event: "suggestions",
        count: suggestions.length,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        estimatedCostUSD,
      }),
    );
    return NextResponse.json({ suggestions, estimatedCostUSD });
  } catch (err) {
    console.error("[suggestions] failed:", err);
    // Suggestions are decorative — the client falls back to its presets, so
    // this endpoint degrades to an empty list rather than an error status.
    return NextResponse.json({ suggestions: [] });
  }
}

// Tolerant extraction: the model is told to return a bare JSON array, but a
// wrapped or fenced one still parses.
function parseSuggestions(text: string): string[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 4);
  } catch {
    return [];
  }
}
