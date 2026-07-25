"use client";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

// Vendored from AI Elements (registry.ai-sdk.dev/inline-citation), then
// trimmed: the upstream carousel (multi-source-per-citation paging) is
// unused here — each of our [S#] chips maps to exactly one chunk — so those
// exports and their embla dependency were removed rather than shipped dead.

export type InlineCitationProps = ComponentProps<"span">;

export const InlineCitation = ({
  className,
  ...props
}: InlineCitationProps) => (
  <span
    className={cn("group inline items-center gap-1", className)}
    {...props}
  />
);

export type InlineCitationTextProps = ComponentProps<"span">;

export const InlineCitationText = ({
  className,
  ...props
}: InlineCitationTextProps) => (
  <span
    className={cn("transition-colors group-hover:bg-accent", className)}
    {...props}
  />
);

export type InlineCitationCardProps = ComponentProps<typeof HoverCard>;

export const InlineCitationCard = (props: InlineCitationCardProps) => (
  <HoverCard {...props} />
);

export type InlineCitationCardTriggerProps = ComponentProps<typeof Badge> & {
  /** URL sources (upstream API — trigger shows the first hostname). */
  sources?: string[];
  /** Non-URL label override — our citations reference documents, not URLs. */
  label?: ReactNode;
};

export const InlineCitationCardTrigger = ({
  sources = [],
  label,
  className,
  ...props
}: InlineCitationCardTriggerProps) => (
  <HoverCardTrigger
    render={
      <Badge
        className={cn("ml-1 rounded-full", className)}
        variant="secondary"
        {...props}
      />
    }
  >
    {label ??
      (sources[0] ? (
        <>
          {new URL(sources[0]).hostname}{" "}
          {sources.length > 1 && `+${sources.length - 1}`}
        </>
      ) : (
        "unknown"
      ))}
  </HoverCardTrigger>
);

export type InlineCitationCardBodyProps = ComponentProps<"div">;

export const InlineCitationCardBody = ({
  className,
  ...props
}: InlineCitationCardBodyProps) => (
  <HoverCardContent className={cn("relative w-80 p-0", className)} {...props} />
);

export type InlineCitationSourceProps = ComponentProps<"div"> & {
  title?: string;
  url?: string;
  description?: string;
};

export const InlineCitationSource = ({
  title,
  url,
  description,
  className,
  children,
  ...props
}: InlineCitationSourceProps) => (
  <div className={cn("space-y-1", className)} {...props}>
    {title && (
      <h4 className="truncate font-medium text-sm leading-tight">{title}</h4>
    )}
    {url && (
      <p className="truncate break-all text-muted-foreground text-xs">{url}</p>
    )}
    {description && (
      <p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    )}
    {children}
  </div>
);

export type InlineCitationQuoteProps = ComponentProps<"blockquote">;

export const InlineCitationQuote = ({
  children,
  className,
  ...props
}: InlineCitationQuoteProps) => (
  <blockquote
    className={cn(
      "border-muted border-l-2 pl-3 text-muted-foreground text-xs italic",
      className
    )}
    {...props}
  >
    {children}
  </blockquote>
);
