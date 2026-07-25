import OpenAI from "openai";
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  LlmProvider,
} from "./provider";

// gpt-4o-mini by default: grounded Q&A over pre-retrieved context is a task
// small models handle well, and it keeps per-query cost around a tenth of a
// cent. LLM_MODEL overrides without a code change.
const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAiProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — copy .env.example to .env");
    }
    this.client = new OpenAI();
    this.model = process.env.LLM_MODEL || DEFAULT_MODEL;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const model = options.model ?? this.model;
    const res = await this.client.chat.completions.create({
      model,
      messages,
      // Low temperature: this is grounded analysis, not creative writing —
      // we want the same question to get roughly the same answer.
      temperature: options.temperature ?? 0.2,
    });

    return {
      text: res.choices[0]?.message?.content ?? "",
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
      model,
    };
  }
}
