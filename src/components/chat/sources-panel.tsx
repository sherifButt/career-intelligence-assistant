"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import type { ChatSource } from "@/lib/types";

// The proof-of-RAG panel: every answer exposes exactly which chunks were
// retrieved and their similarity scores. Collapsed by default so the chat
// stays readable.
export function SourcesPanel({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {sources.length} source{sources.length === 1 ? "" : "s"} retrieved
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li key={s.label} className="rounded-md border bg-muted/40 p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-semibold">[{s.label}]</span>
                <span className="truncate font-medium">{s.documentName}</span>
                <Badge
                  variant={s.docType === "resume" ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {s.docType}
                </Badge>
                <span className="ml-auto font-mono text-muted-foreground">
                  score {s.score.toFixed(3)}
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {s.content}
              </p>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
