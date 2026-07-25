# SPEC — Career Intelligence Assistant

> The build specification written before development started. The AI coding
> assistant (Claude Code) worked phase-by-phase against this document;
> deviations were surfaced, not silently absorbed.
> See [PROGRESS.md](PROGRESS.md) for what was actually built and how it evolved.

## Problem

A full-stack web app that analyses a **résumé against multiple job descriptions**
and answers questions about fit, skill gaps, experience alignment, and interview
prep. Example queries it must handle:

- "What skills am I missing for this role?"
- "How does my experience align with Job #2?"
- "Where is my experience strongest for this posting?"
- "What should I prepare for the interview based on the gaps?"

Chosen because it is a real problem I was personally solving; the corpus is
small but the retrieval and grounding discipline still matters; and it allows
honest demonstration of RAG design choices.

**Seed data:** my CV and a set of sample job descriptions in `/seed`, so the app
has demo content on first run.

## Guiding principles

1. **Start simple.** A small, clean, working solution beats an ambitious broken
   one. Cut scope deliberately and record it as future work.
2. **Every function must be explainable.** No clever abstractions; if a line
   can't be defended in a conversation, it doesn't get written.
3. **Clean commit history.** Small, logical commits — one per meaningful step —
   so the history tells the build story.

## Stack

| Concern       | Choice                                   | Rationale                                             |
| ------------- | ---------------------------------------- | ----------------------------------------------------- |
| Framework     | Next.js (App Router) + TypeScript        | One deployable for FE + API; fast to ship              |
| DB + Vector   | PostgreSQL + pgvector                    | Production-credible, dockerises cleanly, one store     |
| ORM           | Drizzle                                  | Type-safe, lightweight                                 |
| Embeddings    | OpenAI `text-embedding-3-small`          | Cheap, strong; alternatives noted in README            |
| LLM           | Provider abstraction, default gpt-4o-mini| Cost-efficient; swappable                              |
| Orchestration | Hand-rolled RAG pipeline (no framework)  | Transparent, debuggable retrieval — a deliberate choice|
| UI            | Tailwind CSS + shadcn/ui                 | Accessible design system; fast to compose              |
| Containers    | Docker + docker-compose                  | One-command run                                        |
| Tests         | Vitest                                   | Focused tests on chunking, retrieval, guardrails       |

## Architecture

```
Upload / seed (CV + JDs)
        │
        ▼
  Ingestion: parse → chunk (overlap; tagged resume|job) → embed → pgvector
        │
        ▼
  Query: embed → similarity search (doc-type aware) → grounded prompt
        → LLM (provider abstraction) → answer + cited sources + scores
        │
        ▼
  Chat UI: question, grounded answer, visible source chunks
```

## Phase plan

- **Phase 0** — scaffold: Next.js + TS + Tailwind + shadcn, docker-compose with
  pgvector, `.env.example`, `/seed`.
- **Phase 1** — ingestion: text extraction, ~500–800-token chunks with ~15%
  overlap, batched embeddings, `POST /api/ingest`, `pnpm seed`.
- **Phase 2** — retrieval + chat: `retrieve(query, {docType, k})`, grounded
  prompt builder, `POST /api/chat` returning answer/sources/scores/latency/tokens.
- **Phase 3** — UI: chat page, collapsible sources panel, document sidebar,
  quick-action example queries.
- **Phase 4** — guardrails (low-score refusal, always cite), observability
  (structured per-query log with scores/latency/tokens/cost), unit tests.
- **Phase 5** — docs and screenshots.

If time forces a choice: ship the smallest working end-to-end path and
move the rest to "what I'd do next."

## Engineering standards

**Held:** readable conventional TypeScript; small functions; comments explain
*why* (chunk params, k, thresholds, prompt construction); strong typing on RAG
data structures; graceful handling of the obvious failures (missing key, empty
corpus, LLM failure); one-command run.

**Deliberately skipped** (recorded, not hidden): auth, multi-user, rate
limiting, exhaustive error handling, CI/CD, full test coverage, streaming
responses, reranking.

## Definition of done

`docker compose up` + `pnpm seed` → a working app that answers grounded
questions about the CV vs the JDs, showing sources; guardrail, observability
logging and passing tests present; clean commit history; documented decisions.
