import { useState } from "react";
import { StatusBadge } from "../common/StatusBadge";
import { cn } from "../../utils/cn";
import { normalizeTrackerType } from "../../utils/epsExecutionFilters";
import { statusTone } from "./executionPresentation";

export function StatusPill({ status }: { status?: string | null }) {
  return <StatusBadge tone={statusTone(status)}>{status || "Unknown"}</StatusBadge>;
}

export function ExpandableComment({ value }: { value: string | null | undefined }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const text = String(value ?? "").trim();

  if (!text) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <button
      className="block w-full text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.stopPropagation();
        setIsExpanded((current) => !current);
      }}
      title={isExpanded ? "Click to collapse comments" : "Click to expand comments"}
      type="button"
    >
      <span className={isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"}>
        {text}
      </span>
    </button>
  );
}

export function TrackerTypeBadge({
  activeTrackerType,
  onSelectTrackerType,
  value,
}: {
  activeTrackerType: string;
  onSelectTrackerType: (trackerType: string) => void;
  value: string | null | undefined;
}) {
  const trackerType = normalizeTrackerType(value);
  if (!trackerType) {
    return <span className="text-muted-foreground">--</span>;
  }

  const isActive = trackerType.toLowerCase() === activeTrackerType.toLowerCase();

  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onSelectTrackerType(trackerType);
      }}
      type="button"
    >
      {trackerType}
    </button>
  );
}
