"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, Upload } from "lucide-react";
import type { DocType } from "@/lib/db/schema";

// Two ways in, matching the API's two content types: a raw file posted as
// multipart (server-side extraction for pdf/docx) or pasted text posted as
// JSON. Both run the same chunk → embed → store → screen pipeline.
const ACCEPTED = /\.(md|txt|pdf|docx)$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

export function AddDocumentDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<DocType>("job");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ready =
    name.trim().length > 0 &&
    (mode === "file" ? file !== null : pastedText.trim().length > 0);

  function reset() {
    setMode("file");
    setFile(null);
    setPastedText("");
    setName("");
    setDocType("job");
    setDragging(false);
  }

  function handleFile(picked: File) {
    if (!ACCEPTED.test(picked.name)) {
      toast.error("Only .md, .txt, .pdf and .docx files are supported");
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      toast.error(`${picked.name} is too large (max 10 MB)`);
      return;
    }
    setFile(picked);
    setName(picked.name);
    // Convention-based default, same rule as the seed script — still
    // user-overridable via the radio group.
    setDocType(
      /(^|[^a-z])(cv|resume)([^a-z]|$)/i.test(picked.name) ? "resume" : "job",
    );
  }

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      let res: Response;
      if (mode === "file" && file) {
        const form = new FormData();
        form.set("file", file);
        form.set("name", name.trim());
        form.set("docType", docType);
        res = await fetch("/api/ingest", { method: "POST", body: form });
      } else {
        if (pastedText.length > MAX_TEXT_CHARS) {
          throw new Error(`Pasted text is too long (max ${MAX_TEXT_CHARS / 1000}k characters)`);
        }
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            docType,
            content: pastedText,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Ingest failed (${res.status})`);
      toast.success(
        `${name.trim()} ingested — ${data.chunkCount} chunk${data.chunkCount === 1 ? "" : "s"} embedded`,
        {
          description: data.analysis
            ? `${data.analysis.matchScore}% fit${data.analysis.mustHaves ? ` · must-haves ${data.analysis.mustHaves}` : ""} · experience ${data.analysis.seniority}`
            : undefined,
        },
      );
      setOpen(false);
      reset();
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* Lives inside the chat form — explicit type="button" so opening
          the dialog never submits the question form. */}
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon" />}
      >
        <Paperclip className="size-4" />
        <span className="sr-only">Add document to the corpus</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Add a résumé or job description to the corpus — it is chunked,
            embedded, screened for fit, and immediately available to ask about.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "file" | "paste")}>
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1">
              Upload file
            </TabsTrigger>
            <TabsTrigger value="paste" className="flex-1">
              Paste text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) handleFile(dropped);
              }}
              className={`flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-sm transition-colors ${
                dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <Upload className="size-5 text-muted-foreground" />
              {file ? (
                <span className="font-medium">{file.name}</span>
              ) : (
                <>
                  <span className="font-medium">
                    Choose a .md, .txt, .pdf or .docx file
                  </span>
                  <span className="text-xs text-muted-foreground">
                    or drag it here
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
                e.target.value = "";
              }}
            />
          </TabsContent>

          <TabsContent value="paste" className="mt-3">
            <Textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste the job description or résumé here — plain text or markdown…"
              className="max-h-48 min-h-32 text-sm"
              aria-label="Document text"
            />
          </TabsContent>
        </Tabs>

        {(file || pastedText.trim()) && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={mode === "paste" ? "job-4-acme-ai" : "job-4-acme-ai.pdf"}
              />
              <p className="text-xs text-muted-foreground">
                Re-using an existing name replaces that document.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <RadioGroup
                value={docType}
                onValueChange={(v) => setDocType(v as DocType)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="job" id="type-job" />
                  <Label htmlFor="type-job" className="font-normal">
                    Job description
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="resume" id="type-resume" />
                  <Label htmlFor="type-resume" className="font-normal">
                    Résumé
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? "Processing…" : "Ingest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
