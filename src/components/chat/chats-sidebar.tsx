"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Plus, Search } from "lucide-react";

// Placeholder panel: multi-conversation support is out of scope for the
// timebox, but the layout reserves its place. Every interaction says so
// instead of silently doing nothing.
function comingSoon() {
  toast.info("Chats — coming soon", {
    description: "This demo keeps a single conversation per session.",
  });
}

export function ChatsSidebar({
  messageCount,
  lastQuestion,
}: {
  messageCount: number;
  lastQuestion: string | null;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="px-4 py-4">
        <h1 className="text-sm font-semibold">Career Intelligence</h1>
        <p className="text-xs text-muted-foreground">
          Résumé vs job descriptions, grounded answers
        </p>
      </div>
      <Separator />

      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Chats</h2>
          <Badge variant="secondary" className="text-[11px]">
            1
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={comingSoon}
          aria-label="New chat"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations…"
            className="h-8 pl-8 text-xs"
            onFocus={(e) => {
              e.target.blur();
              comingSoon();
            }}
            readOnly
          />
        </div>
      </div>

      <div className="px-2">
        <button
          type="button"
          onClick={comingSoon}
          className="flex w-full flex-col gap-0.5 rounded-md bg-muted/60 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-blue-500" />
            <span className="truncate text-sm font-medium">
              Current session
            </span>
          </span>
          <span className="truncate pl-4 text-xs text-muted-foreground">
            {lastQuestion ?? "Ask about fit, gaps, or interview prep"}
          </span>
          <span className="pl-4 text-xs text-muted-foreground">
            {messageCount} msg{messageCount === 1 ? "" : "s"}
          </span>
        </button>
      </div>
    </aside>
  );
}
