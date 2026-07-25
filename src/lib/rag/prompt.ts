import type { RetrievedChunk } from "@/lib/types";

// The grounding contract lives here: the model may only use the supplied
// context, must cite [S#] labels, and must say so when the context doesn't
// cover the question. The low-similarity guardrail in the API route is the
// hard backstop; this prompt is the soft one.
const SYSTEM_PROMPT = `You are a career intelligence assistant. You analyse a candidate's résumé against job descriptions and answer questions about fit, skill gaps, experience alignment, and interview preparation.

Rules:
- Answer ONLY from the context excerpts provided below. Do not use outside knowledge about companies, roles, or the candidate.
- Cite the excerpts you used inline, using their labels, e.g. [S1] or [S2][S4]. Every factual claim about the résumé or a job description must carry at least one [S#] citation — an uncited claim is a defect.
- If the context does not contain enough information to answer, say exactly that and suggest what document or detail is missing. Never guess.
- Be direct and specific. When asked about gaps, name the missing skills; when asked about alignment, point to concrete evidence from the résumé.
- If the context contains more than one job description and the question is not about a single job, organise the answer per job — name each job document and address it separately, so no posting is silently ignored.
- Use short paragraphs or bullet points. No preamble.`;

export interface GroundedPrompt {
  system: string;
  user: string;
}

export function buildGroundedPrompt(
  question: string,
  retrieved: RetrievedChunk[],
): GroundedPrompt {
  const context = retrieved
    .map(
      (c, i) =>
        `[S${i + 1}] ${c.documentName} · ${c.docType} · chunk ${c.chunkIndex}\n${c.content}`,
    )
    .join("\n\n---\n\n");

  return {
    system: SYSTEM_PROMPT,
    user: `Context excerpts:\n\n${context}\n\nQuestion: ${question}`,
  };
}
