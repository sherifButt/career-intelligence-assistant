import { OpenAiProvider } from "./openai";

// Minimal provider abstraction: the rest of the app only sees `LlmProvider`.
// Swapping to Anthropic (or a local model) means adding one file that
// implements `complete` and registering it in the factory — no changes to
// retrieval, prompting, or the API route.

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface CompletionResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface CompletionOptions {
  /** Overrides the provider's default (0.2). Use 0 for scoring/judgment. */
  temperature?: number;
  /** Overrides LLM_MODEL for this call (e.g. a stronger judge model). */
  model?: string;
}

export interface LlmProvider {
  complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult>;
}

export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER ?? "openai";
  switch (provider) {
    case "openai":
      return new OpenAiProvider();
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}" — only "openai" is implemented`,
      );
  }
}
