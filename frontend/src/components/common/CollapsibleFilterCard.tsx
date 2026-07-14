import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../../utils/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "./StatusBadge";

interface CollapsibleFilterCardProps {
  activeCount?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  title?: string;
}

export function CollapsibleFilterCard({
  activeCount = 0,
  children,
  defaultOpen = false,
  title = "Search & Filters",
}: CollapsibleFilterCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader className="space-y-0 p-0">
        <button
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{title}</CardTitle>
              {activeCount > 0 ? (
                <div className="mt-1">
                  <StatusBadge tone="default">{`${activeCount} active`}</StatusBadge>
                </div>
              ) : null}
            </div>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "")}
            aria-hidden="true"
          />
        </button>
      </CardHeader>
      {isOpen ? <CardContent className="space-y-4 p-4 pt-0">{children}</CardContent> : null}
    </Card>
  );
}
