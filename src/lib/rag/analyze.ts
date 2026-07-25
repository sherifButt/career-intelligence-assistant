import { asc, eq } from "drizzle-orm";
import { chunks, documents, getDb, type JobAnalysis } from "@/lib/db";
import { getLlmProvider } from "@/lib/llm/provider";
import { estimateCostUSD } from "@/lib/observability/cost";

// One recruiter-style screen per job, run at ingest time — the panel reads
// a stored result instead of paying an LLM call per view. ~$0.0004 per job
// with gpt-4o-mini.

// Unanchored "give me a score" prompts cluster around 80-85 for any
// plausible candidate (observed: a TypeScript-first CV scored the same 85 on
// an expert-Python role as on a perfectly matching one). The rubric below
// forces requirement-by-requirement judgment and anchors the bands, with the
// role's PRIMARY skill weighted hardest.
const SYSTEM_PROMPT = `You are an experienced technical recruiter doing a first-pass screen of one candidate résumé against one job description.

Work through this, in order, before answering:
1. Identify the role's PRIMARY required skill/stack (the language, platform, or discipline the job is actually about) and the required years of experience in it.
2. List the job's must-have requirements (required qualifications; ignore nice-to-haves).
3. For each must-have, judge from the résumé text alone: met, partial, or missing.
   - Scan the WHOLE résumé for evidence, especially project descriptions — a skill demonstrated in a project counts as met even when the résumé phrases it differently from the job (e.g. "built a multi-step tool-using agent" meets "hands-on with agents"; "agentic systems" and "AI agents" are the same thing).
   - Credit ONE-HOP inferences: before flagging a must-have as missing, ask whether any project necessarily implies it. Authoring a plugin for a tool implies hands-on experience with that tool; integrating several third-party SDKs implies REST/SDK integration skill; building database-backed systems implies basic SQL. Do NOT credit two-hop leaps (using Docker does not imply Kubernetes).
   - A skill merely listed among many, with no project evidence, is "partial" if the job demands expert/primary-level use of it.
   - For years-of-experience requirements, COMPUTE the duration from the résumé's date ranges against today's date (given below) before judging — "Oct 2019 – Present" is a calculable span, not an unknown.
   - Requirements phrased as alternatives ("at least one of AWS, Azure, Cloudflare, or Vercel"; "Python or Go") are MET by evidencing any single option — do not fail them for lacking the others.
4. Count them, then score with these anchors:
   - 85–100: essentially all must-haves met, including the PRIMARY skill as the candidate's own primary stack and the years requirement.
   - 70–84: most must-haves met; 1–2 partial gaps, none in the PRIMARY skill.
   - 50–69: strong adjacent profile, but the PRIMARY skill is secondary in the résumé, or the required domain/years are clearly not evidenced.
   - 30–49: transferable skills only; several must-haves missing.
   - below 30: wrong role.
   Hard rule: if the candidate's primary stack differs from the role's PRIMARY skill, the score must be below 70 — no matter how strong the rest is.

Output format — two parts, in this order:
PART 1 (analysis, plain text): for EACH must-have, one line: the requirement, the strongest résumé evidence quoted (or "no evidence"), and your judgement met/partial/missing. This part is mandatory — judging without writing the evidence first produces wrong screens.
PART 2 (final line): the JSON object, alone on its own line, exactly this shape:
{"matchScore": <integer 0-100>, "mustHaves": "<met>/<total>", "missing": ["<2-5 word label per unmet must-have, max 6 items>"], "risk": "low"|"medium"|"high", "riskNote": "<one sentence, max 90 chars, naming the single biggest screening-out risk>", "seniority": "under"|"fit"|"over", "apply": "yes"|"no"}
The JSON MUST agree with your PART 1 judgements — count met items from PART 1.

Definitions:
- missing: the unmet/partial must-haves from step 3, as short skill labels ("AWS certification", "Kubernetes in production"). Empty array if all met. It MUST contain exactly (total − met) items — one per unmet must-have, no more, no fewer.
- risk: likelihood an HR screen rejects the application (missing must-haves, domain mismatch, certifications). Tie it to the score: below 50 is never "low" risk.
- seniority: candidate's level relative to the level the role is pitched at ("over" = overqualified).
- apply: your overall verdict — should the candidate spend time applying as-is? "yes" when there's a realistic chance (roughly: score 60+ and no single disqualifying gap); otherwise "no".
Judge only from the two texts. Be honest, not kind. Use the full range — identical scores for different jobs almost always means you failed to discriminate.`;

// Generous cap: chunk-overlap inflates the reconstructed résumé (~20%), and
// an 8k cap silently amputated the CV's tail — including its open-source
// section — so the screen judged evidence it never saw. 20k chars covers any
// realistic CV/JD with overlap; truly huge documents still get bounded.
const MAX_CHARS = 20_000;

// Self-consistency: even at temperature 0 the must-have extraction wobbles
// between runs (observed: the same job flipping 85 ↔ 70 because the model
// found 8 vs 10 requirements). Median-of-3 samples stabilises the score for
// 3x a sub-cent cost.
const SAMPLES = 3;

export async function analyzeJobFit(
  jobContent: string,
): Promise<JobAnalysis | null> {
  const resumeText = await getResumeText();
  // No résumé ingested yet → nothing to compare against.
  if (!resumeText) return null;

  // Without today's date the model can't resolve "Oct 2019 – Present" and
  // wrongly fails years-of-experience requirements (observed: "3+ years AI
  // experience" flagged missing against a 6+ year AI-focused tenure).
  const today = new Date().toISOString().slice(0, 10);
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Today's date: ${today}\n\nRÉSUMÉ:\n${resumeText.slice(0, MAX_CHARS)}\n\nJOB DESCRIPTION:\n${jobContent.slice(0, MAX_CHARS)}`,
    },
  ];

  // The screen uses a stronger model than chat: gpt-4o-mini consistently
  // failed evidence-reading (flagging "hands-on with agents" as missing
  // against a CV describing built agent products) even with explicit rubric
  // instructions. Screening runs once per job ingest, so ~3c for correct
  // judgment beats ~0.2c for confidently wrong.
  const model = process.env.ANALYSIS_MODEL ?? "gpt-4o";
  const provider = getLlmProvider();
  const completions = await Promise.all(
    Array.from({ length: SAMPLES }, () =>
      provider.complete(messages, { temperature: 0, model }),
    ),
  );

  const samples = completions
    .map((c) => parseAnalysis(c.text))
    .filter((a): a is JobAnalysis => a !== null);

  const tokensIn = completions.reduce((n, c) => n + c.tokensIn, 0);
  const tokensOut = completions.reduce((n, c) => n + c.tokensOut, 0);
  const analysis = samples.length > 0 ? medianAnalysis(samples) : null;
  console.log(
    JSON.stringify({
      event: "job_analysis",
      ok: analysis !== null,
      samples: samples.length,
      scores: samples.map((s) => s.matchScore),
      tokensIn,
      tokensOut,
      estimatedCostUSD: estimateCostUSD(
        completions[0].model,
        tokensIn,
        tokensOut,
      ),
    }),
  );
  return analysis;
}

// The sample with the median score wins whole — score, note, and must-have
// count stay mutually consistent instead of being averaged into a chimera.
function medianAnalysis(samples: JobAnalysis[]): JobAnalysis {
  const sorted = [...samples].sort((a, b) => a.matchScore - b.matchScore);
  return sorted[Math.floor(sorted.length / 2)];
}

// The résumé as one text: its chunks in order. Chunk overlap duplicates a
// little text, which is harmless for a screening read.
async function getResumeText(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ content: chunks.content })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(documents.docType, "resume"))
    .orderBy(asc(chunks.documentId), asc(chunks.chunkIndex));
  if (rows.length === 0) return null;
  return rows.map((r) => r.content).join("\n\n");
}

function parseAnalysis(text: string): JobAnalysis | null {
  // The JSON is the final block after the written analysis; take the last
  // '{...}' span (the object has no nested braces).
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  const match =
    start >= 0 && end > start
      ? [text.slice(start, end + 1)]
      : text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const matchScore = Number(raw.matchScore);
    const risk = raw.risk;
    const seniority = raw.seniority;
    if (
      !Number.isFinite(matchScore) ||
      (risk !== "low" && risk !== "medium" && risk !== "high") ||
      (seniority !== "under" && seniority !== "fit" && seniority !== "over")
    ) {
      return null;
    }
    const missing = Array.isArray(raw.missing)
      ? raw.missing
          .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
          .map((m) => m.trim().slice(0, 60))
          .slice(0, 8)
      : [];
    // The model sometimes returns a met/total fraction that disagrees with
    // its own missing list. The list is the concrete, checkable artifact —
    // reconcile the fraction to it so the badge count always equals the
    // bullets shown in the tooltip.
    let mustHaves =
      typeof raw.mustHaves === "string" && /^\d+\/\d+$/.test(raw.mustHaves)
        ? raw.mustHaves
        : undefined;
    if (mustHaves && missing.length > 0) {
      const total = Number(mustHaves.split("/")[1]);
      if (total >= missing.length) {
        mustHaves = `${total - missing.length}/${total}`;
      }
    }
    return {
      matchScore: Math.max(0, Math.min(100, Math.round(matchScore))),
      risk,
      riskNote: typeof raw.riskNote === "string" ? raw.riskNote.slice(0, 140) : "",
      seniority,
      ...(mustHaves ? { mustHaves } : {}),
      ...(missing.length > 0 ? { missing } : {}),
      ...(raw.apply === "yes" || raw.apply === "no" ? { apply: raw.apply } : {}),
    };
  } catch {
    return null;
  }
}
