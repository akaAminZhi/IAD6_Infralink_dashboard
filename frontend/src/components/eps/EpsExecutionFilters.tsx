import { Search } from "lucide-react";
import { CollapsibleFilterCard } from "../common/CollapsibleFilterCard";
import { type EpsFiltersState } from "../../utils/epsExecutionFilters";

export function EpsFilters({
  filters,
  onChange,
  onReset,
  statuses,
}: {
  filters: EpsFiltersState;
  onChange: (filters: EpsFiltersState) => void;
  onReset: () => void;
  statuses: string[];
}) {
  const activeCount = [filters.search.trim(), filters.status].filter(Boolean).length;

  return (
    <CollapsibleFilterCard activeCount={activeCount} defaultOpen title="Find PDM equipment">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,0.7fr)_auto]">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
              placeholder="PDM, module equipment, matched equipment, serial"
              type="search"
              value={filters.search}
            />
          </span>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          EPS Test Status
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onChange({ ...filters, status: event.target.value })}
            value={filters.status}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            className="h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>
    </CollapsibleFilterCard>
  );
}
