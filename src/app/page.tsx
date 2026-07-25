"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AddDocumentDialog } from "@/components/chat/add-document-dialog";
import { AnswerMarkdown } from "@/components/chat/answer-markdown";
import { ChatsSidebar } from "@/components/chat/chats-sidebar";
import {
  ContextPanel,
  type DocumentSummary,
} from "@/components/chat/context-panel";
import { SourcesPanel } from "@/components/chat/sources-panel";
import type { ChatResponse } from "@/lib/types";
import { Check, Copy, SendHorizontal, ShieldAlert, Square } from "lucide-react";

// Example queries, one click away — let anyone try the app without composing
// a question. Shown in the empty state and as the fallback whenever contextual
// suggestions aren't available.
const QUICK_QUERIES = [
  "What skills am I missing for the Forward Deployed Engineer role?",
  "How does my experience align with Job #2?",
  "Where is my experience strongest for the AI Engineer posting?",
  "What should I prepare for the interview based on my gaps?",
];

interface UserMessage {
  role: "user";
  content: string;
}

interface AssistantMessage extends ChatResponse {
  role: "assistant";
}

type Message = UserMessage | AssistantMessage;

export default function ChatPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // null = compare against all jobs; a document id = analyse that job only.
  const [jobScope, setJobScope] = useState<number | null>(null);
  // Contextual follow-ups predicted from the last exchange; null = none yet
  // (presets are shown instead).
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobDocs = documents.filter((d) => d.docType === "job");

  function loadDocuments() {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        const docs: DocumentSummary[] = data.documents ?? [];
        // Résumé first, then jobs by match score (unanalysed last) — sorted
        // once here so the Context panel and the scope chips agree.
        docs.sort((a, b) => {
          if (a.docType !== b.docType) return a.docType === "resume" ? -1 : 1;
          return (
            (b.analysis?.matchScore ?? -1) - (a.analysis?.matchScore ?? -1)
          );
        });
        setDocuments(docs);
      })
      .catch(() => toast.error("Could not load documents — is the DB up?"))
      .finally(() => setDocsLoading(false));
  }

  useEffect(loadDocuments, []);

  // Derived, not synced: if the scoped job was deleted, fall back to "all
  // jobs" instead of sending a stale id the API would reject.
  const effectiveScope =
    jobScope !== null && jobDocs.some((d) => d.id === jobScope)
      ? jobScope
      : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // `scopeOverride` lets a caller scope and ask in one action (the panel's
  // Prep button) — setJobScope + ask in the same tick would otherwise send
  // the stale scope from this render's closure.
  async function ask(question: string, scopeOverride?: number) {
    const scope = scopeOverride ?? effectiveScope;
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          ...(scope !== null && { jobDocumentId: scope }),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setMessages((prev) => [...prev, { role: "assistant", ...data }]);
      // Fire-and-forget: the answer is already on screen; fresh follow-ups
      // swap in whenever they arrive.
      if (!data.guardrailTriggered) {
        void loadSuggestions(trimmed, data.answer);
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
      // Drop the orphaned user message and restore the input so retrying
      // (or rephrasing after a stop) doesn't double it up.
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  // Cancels the client request. The server-side LLM call may still run to
  // completion (and cost its tokens) — acceptable for this scope; noted in
  // the backlog next to streaming.
  function stop() {
    abortRef.current?.abort();
  }

  async function loadSuggestions(question: string, answer: string) {
    setSuggestionsLoading(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const data = await res.json();
      const next = Array.isArray(data.suggestions) ? data.suggestions : [];
      // Fewer than 4 usable suggestions → keep whatever was shown before
      // rather than flashing a half-empty row.
      if (next.length === 4) setSuggestions(next);
    } catch {
      // Decorative feature: silently keep the previous row on failure.
    } finally {
      setSuggestionsLoading(false);
    }
  }

  const lastQuestion =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? null;

  return (
    <div className="flex h-full">
      <ChatsSidebar
        messageCount={messages.length}
        lastQuestion={lastQuestion}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* min-h-0 lets this flex child actually shrink — without it the
            viewport grows past the screen and long chats (e.g. expanded
            sources) become unreachable. */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl px-4 py-8">
            {messages.length === 0 ? (
              <EmptyState onPick={ask} disabled={pending} />
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <AssistantBubble key={i} message={m} />
                  ),
                )}
                {pending && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background">
          <div className="mx-auto max-w-3xl px-4 py-3">
            {messages.length > 0 &&
              (suggestionsLoading ? (
                <div className="mb-2 flex gap-2 pb-1" aria-hidden>
                  <Skeleton className="h-8 w-44 shrink-0 rounded-md" />
                  <Skeleton className="h-8 w-52 shrink-0 rounded-md" />
                  <Skeleton className="h-8 w-40 shrink-0 rounded-md" />
                  <Skeleton className="h-8 w-48 shrink-0 rounded-md" />
                </div>
              ) : (
                <QuickQueries
                  queries={suggestions ?? QUICK_QUERIES}
                  onPick={ask}
                  disabled={pending}
                  compact
                />
              ))}
            {jobDocs.length > 1 && (
              <JobScopeSelector
                jobs={jobDocs}
                scope={effectiveScope}
                onScopeChange={setJobScope}
                disabled={pending}
              />
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <AddDocumentDialog onAdded={loadDocuments} />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about fit, skill gaps, or interview prep…"
                aria-label="Your question"
                disabled={pending}
              />
              {pending ? (
                <Button
                  type="button"
                  onClick={stop}
                  size="icon"
                  variant="outline"
                  aria-label="Stop generating"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim()} size="icon">
                  <SendHorizontal className="size-4" />
                  <span className="sr-only">Send</span>
                </Button>
              )}
            </form>
          </div>
        </div>
      </main>

      <ContextPanel
        documents={documents}
        loading={docsLoading}
        onDocumentsChanged={loadDocuments}
        onPrep={(doc) => {
          setJobScope(doc.id);
          void ask(
            `What should I prepare for the ${jobLabel(doc.name)} interview, given my gaps?`,
            doc.id,
          );
        }}
      />
    </div>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const [copied, setCopied] = useState(false);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(message.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not access the clipboard");
    }
  }

  return (
    <div className="max-w-[95%]">
      {message.guardrailTriggered && (
        <p className="mb-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <ShieldAlert className="size-3.5" />
          Retrieval confidence too low — refused rather than guessed
        </p>
      )}
      <div className="rounded-2xl border bg-card px-4 py-3 text-sm [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        <AnswerMarkdown answer={message.answer} sources={message.sources} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <p className="font-mono text-[11px] text-muted-foreground">
          {(message.latencyMs / 1000).toFixed(1)}s · {message.tokenUsage.input}{" "}
          in / {message.tokenUsage.output} out · ~$
          {message.estimatedCostUSD.toFixed(4)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 text-muted-foreground"
          onClick={copyAnswer}
          aria-label={copied ? "Copied" : "Copy answer"}
        >
          {copied ? (
            <Check className="size-3.5 text-green-600" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
      {message.sources.length > 0 && <SourcesPanel sources={message.sources} />}
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <h2 className="text-lg font-semibold">
        Ask anything about your fit for these roles
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Answers are grounded in the résumé and job descriptions in the
        Context panel — every response shows the exact excerpts it used.
      </p>
      <div className="mt-6 w-full max-w-md">
        <QuickQueries queries={QUICK_QUERIES} onPick={onPick} disabled={disabled} />
      </div>
    </div>
  );
}

// Scopes retrieval to one job posting: an explicit UI control instead of
// hoping the embedding similarity resolves "Job #2" from the question text.
function JobScopeSelector({
  jobs,
  scope,
  onScopeChange,
  disabled,
}: {
  jobs: DocumentSummary[];
  scope: number | null;
  onScopeChange: (scope: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1"
      role="radiogroup"
      aria-label="Job scope"
    >
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Analyse against
      </span>
      <Button
        variant={scope === null ? "secondary" : "ghost"}
        size="sm"
        role="radio"
        aria-checked={scope === null}
        disabled={disabled}
        onClick={() => onScopeChange(null)}
        className="h-7 shrink-0 rounded-full px-3 text-xs"
      >
        All jobs
      </Button>
      {jobs.map((job) => (
        <Button
          key={job.id}
          variant={scope === job.id ? "secondary" : "ghost"}
          size="sm"
          role="radio"
          aria-checked={scope === job.id}
          disabled={disabled}
          onClick={() => onScopeChange(scope === job.id ? null : job.id)}
          className="h-7 shrink-0 rounded-full px-3 text-xs"
          title={job.name}
        >
          {jobLabel(job.name)}
        </Button>
      ))}
    </div>
  );
}

// "job-2-senior-fullstack.md" → "job-2-senior-fullstack" is still noisy on a
// chip; shorten to the leading "Job N" when the seed naming convention
// matches, otherwise fall back to the bare filename.
function jobLabel(name: string): string {
  const match = name.match(/^job[-_ ]?(\d+)/i);
  return match ? `Job ${match[1]}` : name.replace(/\.(md|txt|pdf|docx)$/i, "");
}

function QuickQueries({
  queries,
  onPick,
  disabled,
  compact = false,
}: {
  queries: string[];
  onPick: (q: string) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? "mb-2 flex gap-2 overflow-x-auto pb-1" : "grid gap-2"
      }
    >
      {queries.map((q) => (
        <Button
          key={q}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(q)}
          className={
            compact
              ? "shrink-0 text-xs font-normal"
              : "h-auto justify-start whitespace-normal py-2 text-left text-xs font-normal"
          }
        >
          {q}
        </Button>
      ))}
    </div>
  );
}
