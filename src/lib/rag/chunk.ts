// Chunking strategy: paragraph-first packing with a character budget and a
// tail overlap. Sizes are in characters using the ~4 chars/token heuristic —
// chunk sizing doesn't need tokenizer precision, and it saves a dependency.
//
// - ~600 tokens (2400 chars) per chunk: big enough that a CV role or a JD
//   section survives intact, small enough that top-k retrieval stays focused.
// - ~15% overlap (360 chars): a fact straddling a boundary (e.g. a skill list
//   split mid-way) still appears whole in one of the two chunks.

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  maxChars: 2400,
  overlapChars: 360,
};

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars, overlapChars } = { ...DEFAULTS, ...options };

  // Paragraphs are the natural semantic unit in CVs and JDs (a role, a
  // requirement block). Only paragraphs that exceed the budget get split
  // further, by sentence.
  const units = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > maxChars ? splitBySentence(p, maxChars) : [p]));

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    // The `current.length > overlapChars` guard stops us emitting a chunk
    // that is nothing but the carried-over overlap.
    if (candidate.length > maxChars && current.length > overlapChars) {
      chunks.push(current);
      current = `${overlapTail(current, overlapChars)}\n\n${unit}`;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitBySentence(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    // A single sentence longer than the budget gets hard-sliced — rare
    // enough in this corpus that smarter handling isn't worth the code.
    if (sentence.length > maxChars) {
      if (current) {
        parts.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        parts.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Last `overlapChars` of a chunk, trimmed forward to a word boundary so the
// overlap never starts mid-word.
function overlapTail(chunk: string, overlapChars: number): string {
  if (chunk.length <= overlapChars) return chunk;
  const tail = chunk.slice(-overlapChars);
  const firstSpace = tail.indexOf(" ");
  return firstSpace === -1 ? tail : tail.slice(firstSpace + 1);
}
