import { Copy } from "lucide-react";

import type { NetaDuplicateMatch } from "../../types/data";
import { cn } from "../../utils/cn";
import { duplicateLabel } from "../../utils/netaDuplicates";

export function NetaDuplicateBadge({ matches }: { matches: NetaDuplicateMatch[] }) {
  if (!matches.length) return null;
  const confirmed = matches.some((match) => match.status === "confirmed");
  const possible = matches.some((match) => match.status === "possible");
  const label = confirmed ? "Duplicate" : possible ? "Possible duplicate" : "Duplicate evidence invalid";

  return (
    <span
      aria-label={confirmed ? "Confirmed duplicate report" : label}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium",
        confirmed || possible
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      )}
      title={matches.map((match) => `${duplicateLabel(match)}: ${match.first.name} / ${match.second.name}`).join("\n")}
    >
      <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
