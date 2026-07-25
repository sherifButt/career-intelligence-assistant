"use client";

import ReactMarkdown from "react-markdown";
import {
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { Badge } from "@/components/ui/badge";
import type { ChatSource } from "@/lib/types";

// Adapted from the shadcn "AI message with citations" pattern (via the open
// AI Elements inline-citation component): the [S#] markers the model is
// instructed to emit become numbered chips that reveal the cited chunk on
// hover — document, type, similarity score, and the excerpt itself.
//
// Mechanically: [S1] is rewritten to a markdown link [S1](#cite-S1) before
// rendering, so ReactMarkdown hands us a real node to replace — no regex
// over rendered HTML. Only the render path is rewritten; copy-to-clipboard
// still gets the original answer text.

const CITE_PREFIX = "#cite-";

export function AnswerMarkdown({
  answer,
  sources,
}: {
  answer: string;
  sources: ChatSource[];
}) {
  const withCiteLinks = answer.replace(/\[S(\d+)\]/g, `[S$1](${CITE_PREFIX}S$1)`);

  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith(CITE_PREFIX)) {
            const label = href.slice(CITE_PREFIX.length);
            const source = sources.find((s) => s.label === label);
            // A marker without a matching source (model hallucinated a
            // label) degrades to plain text rather than a dead chip.
            if (!source) return <span>[{label}]</span>;
            return <CitationChip source={source} />;
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {withCiteLinks}
    </ReactMarkdown>
  );
}

function CitationChip({ source }: { source: ChatSource }) {
  return (
    <InlineCitationCard>
      {/* Dark like the card it opens — hover-born surfaces share one look. */}
      <InlineCitationCardTrigger
        label={source.label.replace(/^S/, "")}
        className="h-4 min-w-4 cursor-default justify-center border-transparent bg-foreground px-1 align-super text-[10px] leading-none text-background hover:bg-foreground/85"
      />
      {/* `dark` flips the theme variables for this subtree only — the card
          renders inverted (dark) over the light page, matching the app's
          tooltip treatment for hover-born surfaces. */}
      <InlineCitationCardBody className="dark bg-popover p-4 text-popover-foreground">
        <InlineCitationSource
          title={source.documentName}
          description={`chunk ${source.chunkIndex} · similarity ${source.score.toFixed(3)}`}
        >
          <Badge
            variant={source.docType === "resume" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {source.docType}
          </Badge>
          <InlineCitationQuote>
            {source.content.length > 280
              ? `${source.content.slice(0, 280)}…`
              : source.content}
          </InlineCitationQuote>
        </InlineCitationSource>
      </InlineCitationCardBody>
    </InlineCitationCard>
  );
}
