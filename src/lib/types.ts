import type { DocType } from "@/lib/db/schema";

// The core RAG data shapes. Kept in one place so the API route, UI, and
// tests all agree on what flows through the pipeline.

export interface RetrievedChunk {
  chunkId: number;
  documentName: string;
  docType: DocType;
  chunkIndex: number;
  content: string;
  /** Cosine similarity in [0, 1] — higher is more relevant. */
  score: number;
}

export interface ChatSource {
  /** Citation label used in the answer text, e.g. "S1". */
  label: string;
  documentName: string;
  docType: DocType;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  /** True when retrieval was too weak to answer and we refused. */
  guardrailTriggered: boolean;
  latencyMs: number;
  tokenUsage: TokenUsage;
  estimatedCostUSD: number;
}
