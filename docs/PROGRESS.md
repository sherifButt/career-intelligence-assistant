# PROGRESS — build log

What was actually built, in order. Each entry maps to one or more commits;
`git log` tells the same story in finer grain. The plan lived in
[SPEC.md](SPEC.md); this file records where reality followed it and where it
deliberately went further.

## Phased build (per spec)

| Phase | Delivered | Notes |
| --- | --- | --- |
| 0 · Scaffold | Next.js + TS + Tailwind + shadcn, docker-compose with pgvector (host port 5434 to avoid a local collision), `.env.example`, seed corpus | Schema in `db/init.sql` rather than migrations — a recorded local-only shortcut |
| 1 · Ingestion | Paragraph-first chunker (~600 tokens, 15% overlap), batched embeddings, idempotent `pnpm seed`, `POST /api/ingest` | Verified end-to-end against the real corpus before committing |
| 2 · Retrieval + chat | Balanced two-sided retrieval (résumé + jobs with one query embedding), grounded prompt with [S#] labels, provider abstraction, `POST /api/chat` with scores/latency/tokens | |
| 3 · UI | Chat page, collapsible sources panel with per-chunk scores, corpus sidebar, one-click example queries | Built with shadcn components via CLI |
| 4 · Guardrails/observability/tests | Refusal below empirically-picked 0.25 max-score threshold (before LLM spend), structured `chat_query` JSON log with cost, Vitest suite | Threshold pinned by an integration test |
| 5 · Docs | README, architecture diagram, screenshots | |

## Post-phase evolution (feature requests while using the app)

- **Per-job retrieval budgets + job scope selector** — global top-k let the
  most-similar posting monopolise context once JDs spanned multiple chunks;
  the job side is now budgeted per job, and an "Analyse against" selector
  scopes a question to one posting (validated server-side).
- **Corpus management** — upload via a paperclip dialog (file or pasted text;
  pdf/docx extracted server-side with unpdf/mammoth; size caps enforced on
  both sides; fixture-based extraction tests) and per-document delete with
  cascade + scope fallback. Entry points in the chat input and the panel header.
- **Three-pane layout** — chats placeholder (visible "coming soon", not a
  hidden gap) · chat · context panel with per-file size/time.
- **Inline citations** — [S#] markers render as chips with hover cards
  (adapted from the open AI Elements component after the original registry
  proved token-gated; vendored code trimmed to pass this repo's lint).
- **Contextual follow-up suggestions** — a small LLM call after each answer
  proposes the next four questions; fired post-render so it adds no latency,
  falls back to presets on any failure.
- **Job match screening** — recruiter-style screen at ingest surfaced in the
  app's vocabulary: fit %, skill gaps (count + the actual missing
  skills in a tooltip), experience alignment, and an apply verdict, aligned
  in fixed columns and ranked best-first. Jobs re-screen when the résumé
  changes. One-click interview prep on Yes verdicts routes into the chat,
  scoped to that job.
- **Stop button** (client abort), **copy answer**, dark hover surfaces,
  various UX polish; a real flex `min-h-0` scroll bug found and fixed.

## Screening quality: three calibration rounds (the part worth reading)

1. **Score clustering** — the first screen gave ~85% to every plausible job.
   Fixed with an anchored rubric (extract must-haves, judge each from résumé
   evidence, explicit score bands, primary-skill weighting) and median-of-3
   sampling at temperature 0 after observing the extraction wobble between
   runs.
2. **False gaps** — the screen flagged skills the CV demonstrably has. Two
   root causes: no date anchor (the model cannot resolve "Oct 2019 – Present"
   without being told today's date) and an evidence-reading failure that
   survived prompt fixes — a capability limit, addressed by using a stronger
   judge model for the once-per-ingest screen (`ANALYSIS_MODEL`).
3. **The human audit** — a line-by-line audit of every screen against the
   documents found the remaining error pattern (one-hop evidence not being
   credited) and exposed two hidden bugs: the reconstructed résumé was being
   truncated before judging, and the "JSON only" output format was
   suppressing the model's reasoning — asked to quote evidence per
   requirement it judged correctly, forced into bare JSON it pattern-matched.
   The screen now reasons first and emits JSON last, and the gap count is
   derived from the evidence list so the two can never disagree. Post-fix
   screens match the human audit; the audit's per-flag verdicts double as a
   golden eval set for CI (top of the backlog).

Principles that fell out of this: prompt fixes are for instruction failures,
model upgrades are for capability failures; bare-JSON formats suppress judge
quality — let models show their work; verify what the model actually received;
and displaying a summary number next to its evidence (so a human can audit it)
is the fastest quality loop there is.
