// Text extraction for uploaded files. Runs server-side only: pdf/docx
// parsing needs Node buffers and pulls in real dependencies (pdf.js via
// unpdf, mammoth), which have no business in the client bundle — both are
// dynamically imported so they load on first use.

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(
      `Unsupported file type for "${filename}" — use .md, .txt, .pdf, or .docx`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export const EXTRACTABLE = /\.(md|txt|pdf|docx)$/i;

export async function extractTextFromUpload(
  filename: string,
  data: Buffer,
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "txt":
      return data.toString("utf8");
    case "pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    }
    case "docx": {
      const { default: mammoth } = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: data });
      return value;
    }
    default:
      throw new UnsupportedFileTypeError(filename);
  }
}
