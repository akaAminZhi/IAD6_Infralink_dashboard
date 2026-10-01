import { Search } from "lucide-react";

import type { PdmReadinessLevel } from "../../utils/pdmUtils";
import { CollapsibleFilterCard } from "../common/CollapsibleFilterCard";
import { Button } from "../ui/button";

export type PdmQuickFilter =
  | ""
  | "testingStarted"
  | "fullyReady"
  | "needsAttention"
  | "watch"
  | "attention"
  | "critical"
  | "notStarted";

export interface PdmFiltersState {
  search: string;
  readiness: "" | PdmReadinessLevel;
  quickFilter: PdmQuickFilter;
  energisation: "" | "offsite" | "onsite";
  openCasesOnly: boolean;
  netaIncompleteOnly: boolean;
  missingReportsOnly: boolean;
  missingIssueImagesOnly: boolean;
}

interface PdmFiltersProps {
  filters: PdmFiltersState;
  onChange: (filters: PdmFiltersState) => void;
  onReset: () => void;
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className={active ? "border-amber-300 bg-amber-50 text-amber-900" : ""}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

export function PdmFilters({ filters, onChange, onReset }: PdmFiltersProps) {
  function update(next: Partial<PdmFiltersState>) {
    onChange({ ...filters, ...next });
  }
  const activeFilterCount = [
    filters.search.trim(),
    filters.readiness,
    filters.quickFilter,
    filters.energisation,
    filters.openCasesOnly,
    filters.netaIncompleteOnly,
    filters.missingReportsOnly,
    filters.missingIssueImagesOnly,
  ].filter(Boolean).length;

  return (
    <CollapsibleFilterCard activeCount={activeFilterCount}>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_minmax(180px,0.8fr)_auto]">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Search by PDM Name or Equipment ID
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Search PDM, equipment ID, or source label"
                type="search"
                value={filters.search}
              />
            </span>
          </label>

          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Current Readiness
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) =>
                update({ readiness: event.target.value as PdmFiltersState["readiness"] })
              }
              value={filters.readiness}
            >
              <option value="">All readiness levels</option>
              <option value="Not Started">Not Started</option>
              <option value="Good">Good</option>
              <option value="Watch">Watch</option>
              <option value="Attention">Attention</option>
              <option value="Critical">Critical</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Energisation
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={filters.energisation}
              onChange={(event) =>
                update({ energisation: event.target.value as PdmFiltersState["energisation"] })
              }
            >
              <option value="">All energisation records</option>
              <option value="offsite">Energised Offsite</option>
              <option value="onsite">Energised Onsite</option>
            </select>
          </label>

          <div className="flex items-end">
            <Button className="w-full xl:w-auto" onClick={onReset} type="button" variant="ghost">
              Reset
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ToggleButton
            active={filters.openCasesOnly}
            onClick={() => update({ openCasesOnly: !filters.openCasesOnly })}
          >
            Open cases
          </ToggleButton>
          <ToggleButton
            active={filters.netaIncompleteOnly}
            onClick={() => update({ netaIncompleteOnly: !filters.netaIncompleteOnly })}
          >
            NETA incomplete
          </ToggleButton>
          <ToggleButton
            active={filters.missingReportsOnly}
            onClick={() => update({ missingReportsOnly: !filters.missingReportsOnly })}
          >
            Missing NETA reports
          </ToggleButton>
          <ToggleButton
            active={filters.missingIssueImagesOnly}
            onClick={() =>
              update({ missingIssueImagesOnly: !filters.missingIssueImagesOnly })
            }
          >
            Missing issue images
          </ToggleButton>
        </div>
    </CollapsibleFilterCard>
  );
}
