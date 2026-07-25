import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// Recruiter-style screen of one résumé against one job. Job-seeker mode
// stores it on the job row (résumé vs that job); Recruiter mode stores it on
// each candidate résumé row (that candidate vs the chosen req).
export interface JobAnalysis {
  /** 0–100 overall skills/experience match. */
  matchScore: number;
  /** Likelihood an HR screen rejects the application. */
  risk: "low" | "medium" | "high";
  /** One line naming the biggest screening-out risk. */
  riskNote: string;
  /** Candidate level vs the level the role is pitched at. */
  seniority: "under" | "fit" | "over";
  /** Must-have requirements met, e.g. "6/9" — anchors the score. */
  mustHaves?: string;
  /** Short labels of the unmet must-haves, e.g. "AWS certification". */
  missing?: string[];
  /** Overall verdict: is this application worth making as-is? */
  apply?: "yes" | "no";
  /** The PART 1 written reasoning (per must-have evidence) — "shows the work". */
  evidence?: string;
  /** Recruiter mode: the job document this candidate was screened against. */
  vsJobId?: number;
}

// Mirrors db/init.sql, which is the actual source of truth (it runs on first
// postgres boot). Duplicating ~20 lines of DDL was chosen over wiring a
// migration runner into the docker startup path — one less moving part.

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  docType: text("doc_type", { enum: ["resume", "job"] }).notNull(),
  analysis: jsonb("analysis").$type<JobAnalysis | null>(),
  // Recruiter-mode candidate/req uploads are scoped to an ephemeral session
  // and auto-purged; NULL means the shared job-seeker corpus.
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  // 1536 dims = OpenAI text-embedding-3-small
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
});

export type DocType = "resume" | "job";
