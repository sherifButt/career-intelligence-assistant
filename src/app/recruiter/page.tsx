"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MatchStats } from "@/components/chat/context-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobAnalysis } from "@/lib/db/schema";
import type { ChatResponse } from "@/lib/types";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

interface Candidate {
  documentId: number;
  name: string;
  analysis: JobAnalysis | null;
}

interface ResumeInput {
  id: number;
  name: string;
  content: string;
}

const MAX_RESUMES = 12;
let rowSeq = 1;
const blankRow = (): ResumeInput => ({ id: rowSeq++, name: "", content: "" });

export default function RecruiterPage() {
  const [jobText, setJobText] = useState("");
  const [rows, setRows] = useState<ResumeInput[]>([blankRow()]);
  const [screening, setScreening] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore an in-progress session on refresh (candidates persist for 24h).
  useEffect(() => {
    fetch("/api/recruiter/candidates")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.candidates) && d.candidates.length > 0) {
          setCandidates(d.candidates);
          setJobId(d.jobId ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const filled = rows.filter((r) => r.content.trim().length > 0);

  function setRow(id: number, patch: Partial<ResumeInput>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) =>
      prev.length >= MAX_RESUMES ? prev : [...prev, blankRow()],
    );
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.id !== id)));
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const added: ResumeInput[] = [];
    for (const file of Array.from(files).slice(0, MAX_RESUMES)) {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) {
        toast.error(`${file.name}: paste .txt/.md text (PDF/DOCX upload coming soon)`);
        continue;
      }
      const content = await file.text();
      if (content.trim()) added.push({ id: rowSeq++, name: file.name, content });
    }
    if (added.length) {
      setRows((prev) => {
        const kept = prev.filter((r) => r.content.trim() || r.name.trim());
        return [...kept, ...added].slice(0, MAX_RESUMES);
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function screen() {
    if (jobText.trim().length < 30) {
      toast.error("Paste the job description first (the req you're screening for).");
      return;
    }
    if (filled.length === 0) {
      toast.error("Add at least one candidate résumé.");
      return;
    }
    setScreening(true);
    try {
      const resumes = filled.map((r, i) => ({
        name: r.name.trim() || `Candidate ${i + 1}`,
        content: r.content,
      }));
      const res = await fetch("/api/recruiter/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText, resumes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Screening failed (${res.status})`);
      setCandidates(data.candidates ?? []);
      setJobId(data.jobId ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Screening failed");
    } finally {
      setScreening(false);
    }
  }

  async function clearSession() {
    try {
      await fetch("/api/recruiter/clear", { method: "POST" });
    } catch {
      /* best effort */
    }
    setCandidates([]);
    setJobId(null);
    setRows([blankRow()]);
    setJobText("");
    toast.success("Session cleared — candidate résumés deleted.");
  }

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Job-seeker mode
          </Link>
          <h1 className="text-lg font-semibold">Recruiter — screen a shortlist</h1>
          <p className="text-sm text-muted-foreground">
            Rank candidate résumés against one req, each score backed by cited
            evidence you can defend.
          </p>
        </div>
        {candidates.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearSession}>
            <Trash2 className="mr-1.5 size-3.5" /> Clear session
          </Button>
        )}
      </header>

      <p className="mb-6 flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Résumés are scoped to your session and auto-deleted after 24 hours —
          they never enter the public corpus. Still, don&apos;t upload candidate
          data you&apos;re not cleared to process.
        </span>
      </p>

      {/* Step 1: the req */}
      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-medium">
          1. The role (job description)
        </label>
        <Textarea
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          placeholder="Paste the job description you're hiring for…"
          className="min-h-28 text-sm"
          aria-label="Job description"
        />
      </section>

      {/* Step 2: candidates */}
      <section className="mb-6">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium">
            2. Candidates{" "}
            <span className="text-muted-foreground">
              ({filled.length}/{MAX_RESUMES})
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Upload .txt/.md
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={row.name}
                  onChange={(e) => setRow(row.id, { name: e.target.value })}
                  placeholder={`Candidate ${i + 1} name (optional)`}
                  className="h-8 text-sm"
                  aria-label={`Candidate ${i + 1} name`}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove candidate ${i + 1}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <Textarea
                value={row.content}
                onChange={(e) => setRow(row.id, { content: e.target.value })}
                placeholder="Paste this candidate's résumé text…"
                className="min-h-20 text-sm"
                aria-label={`Candidate ${i + 1} résumé`}
              />
            </div>
          ))}
        </div>
        {rows.length < MAX_RESUMES && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={addRow}>
            <Plus className="mr-1.5 size-3.5" /> Add candidate
          </Button>
        )}
      </section>

      <Button onClick={screen} disabled={screening} className="w-full">
        {screening ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Screening{" "}
            {filled.length} candidate{filled.length === 1 ? "" : "s"}…
          </>
        ) : (
          <>Screen {filled.length || ""} candidate{filled.length === 1 ? "" : "s"}</>
        )}
      </Button>

      {/* Results */}
      {candidates.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">
              Ranked shortlist{" "}
              <span className="text-muted-foreground">
                ({candidates.length})
              </span>
            </h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              best fit first
            </span>
          </div>
          <ol className="space-y-3">
            {candidates.map((c, i) => (
              <CandidateCard
                key={c.documentId}
                rank={i + 1}
                candidate={c}
                jobId={jobId}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function CandidateCard({
  rank,
  candidate,
  jobId,
}: {
  rank: number;
  candidate: Candidate;
  jobId: number | null;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const a = candidate.analysis;

  async function ask() {
    if (!q.trim() || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.trim(),
          resumeDocumentId: candidate.documentId,
          ...(jobId !== null && { jobDocumentId: jobId }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setAnswer(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Question failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={candidate.name}>
            {candidate.name}
          </p>
          {a ? (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              <MatchStats analysis={a} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Not screened — no readable résumé text.
            </p>
          )}
          {a?.riskNote && (
            <p className="mt-1.5 text-xs text-muted-foreground">{a.riskNote}</p>
          )}

          {/* Actions */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {a?.evidence && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowEvidence((v) => !v)}
              >
                <ChevronDown
                  className={`mr-1 size-3.5 transition-transform ${showEvidence ? "rotate-180" : ""}`}
                />
                {showEvidence ? "Hide" : "Show"} evidence
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setAsking((v) => !v)}
            >
              Ask about this candidate
            </Button>
          </div>

          {showEvidence && a?.evidence && (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {a.evidence}
            </pre>
          )}

          {asking && (
            <div className="mt-3 border-t pt-3">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="e.g. Does this candidate evidence Kubernetes in production?"
                  className="h-8 text-sm"
                  aria-label={`Ask about ${candidate.name}`}
                  disabled={busy}
                />
                <Button type="submit" size="sm" disabled={busy || !q.trim()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Ask"}
                </Button>
              </form>
              {answer && (
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  {answer.guardrailTriggered ? (
                    <p className="text-muted-foreground">{answer.answer}</p>
                  ) : (
                    <p className="whitespace-pre-wrap">{answer.answer}</p>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Grounded in {answer.sources.length} retrieved chunk
                    {answer.sources.length === 1 ? "" : "s"} from this
                    candidate&apos;s résumé and the req.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        {a && (
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {a.matchScore}%
          </Badge>
        )}
      </div>
    </li>
  );
}
