import OpenAI from "openai";

// text-embedding-3-small: strong retrieval quality at $0.02/1M tokens — this
// whole corpus embeds for a fraction of a cent. Alternatives (Cohere, local
// BGE) noted in the README; not worth a second provider dependency here.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// Well under the API's input limit; batching keeps one request per ~100
// chunks instead of one per chunk.
const BATCH_SIZE = 100;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — copy .env.example to .env");
    }
    client = new OpenAI();
  }
  return client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    embeddings.push(...res.data.map((d) => d.embedding));
  }
  return embeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedTexts([query]);
  return embedding;
}
