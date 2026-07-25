// Per-1M-token USD prices, hardcoded deliberately: a config system for four
// numbers is over-engineering at this scale. Update here if models change.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export function estimateCostUSD(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = PRICES[model];
  // Unknown model → 0 rather than a wrong guess; the log line still carries
  // token counts so cost can be reconstructed later.
  if (!price) return 0;
  return (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
}
