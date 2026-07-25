// One structured JSON line per chat query — greppable locally, and the shape
// a log aggregator (CloudWatch, GCP Logging) would ingest as-is in
// production. Console-only is a deliberate scope cut.

export interface QueryLog {
  queryId: string;
  question: string;
  retrievalScores: number[];
  guardrailTriggered: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUSD: number;
  model: string;
}

export function logQuery(entry: QueryLog): void {
  console.log(JSON.stringify({ event: "chat_query", ...entry }));
}
