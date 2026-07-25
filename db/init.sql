-- Runs automatically on first postgres boot (docker-entrypoint-initdb.d).
-- Schema lives here rather than in a migration tool: for a single-table
-- project of this size, one idempotent SQL file is simpler to reason about.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  doc_type    text NOT NULL CHECK (doc_type IN ('resume', 'job')),
  -- For jobs: LLM fit analysis computed once at ingest
  -- ({matchScore, risk, riskNote, seniority}); null for the resume or if
  -- analysis failed.
  analysis    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id           serial PRIMARY KEY,
  document_id  integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  content      text NOT NULL,
  -- 1536 dims = OpenAI text-embedding-3-small
  embedding    vector(1536) NOT NULL
);

-- HNSW over ivfflat: no training step needed, works well on tiny corpora.
-- At this corpus size (~100 chunks) any index is overkill; it's here to show
-- the production-shaped setup.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
