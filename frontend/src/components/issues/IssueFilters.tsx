import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { IssueDueState } from "../../utils/issueUtils";
import { CollapsibleFilterCard } from "../common/CollapsibleFilterCard";
import { Button } from "../ui/button";

export interface IssueFiltersState {
  caseSearch: string;
  equipmentSearch: string;
  pdmSearch: string;
  summarySearch: string;
  status: string;
  priority: string;
  assignedTo: string[];
  dueState: "" | IssueDueState;
  openOnly: boolean;
  missingImageOnly: boolean;
  urgentHighOnly: boolean;
  netaIncompleteOnly: boolean;
  missingNetaReportOnly: boolean;
  createdYesterdayOnly: boolean;
  createdSinceBaselineOnly: boolean;
  resolvedSinceBaselineOnly: boolean;
}

interface IssueFiltersProps {
  filters: IssueFiltersState;
  statuses: string[];
  priorities: string[];
  assignees: string[];
  dueStates: string[];
  onChange: (filters: IssueFiltersState) => void;
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

function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <span className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
      </span>
    </label>
  );
}

function SelectFilter({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssigneeMultiFilter({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = new Set(value);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function toggleAssignee(assignee: string) {
    if (selected.has(assignee)) {
      onChange(value.filter((name) => name !== assignee));
      return;
    }

    onChange([...value, assignee]);
  }

  return (
    <div className="relative flex min-w-0 flex-col gap-1 text-sm font-medium" ref={containerRef}>
      <span>Assigned To</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm outline-none transition-colors hover:bg-accent focus:ring-2 focus:ring-ring"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="truncate">
          {value.length === 0
            ? "All assignees"
            : `${value.length} assignee${value.length === 1 ? "" : "s"} selected`}
        </span>
        <span className="text-xs text-muted-foreground">{isOpen ? "Hide" : "Select"}</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(520px,calc(100vw-2rem))] rounded-md border bg-card shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="text-xs text-muted-foreground">
              {value.length === 0 ? "All assignees" : `${value.length} selected`}
            </div>
            {value.length > 0 ? (
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => onChange([])}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto p-2">
            {options.length === 0 ? (
              <div className="px-1 py-2 text-sm text-muted-foreground">No assignees found</div>
            ) : (
              options.map((assignee) => (
                <label
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-muted"
                  key={assignee}
                >
                  <input
                    checked={selected.has(assignee)}
                    className="mt-0.5 h-4 w-4"
                    onChange={() => toggleAssignee(assignee)}
                    type="checkbox"
                  />
                  <span className="min-w-0 break-words">{assignee}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IssueFilters({
  filters,
  statuses,
  priorities,
  assignees,
  dueStates,
  onChange,
  onReset,
}: IssueFiltersProps) {
  function update(next: Partial<IssueFiltersState>) {
    onChange({ ...filters, ...next });
  }
  const activeFilterCount = [
    filters.caseSearch.trim(),
    filters.equipmentSearch.trim(),
    filters.pdmSearch.trim(),
    filters.summarySearch.trim(),
    filters.status,
    filters.priority,
    filters.assignedTo.length,
    filters.dueState,
    filters.openOnly,
    filters.missingImageOnly,
    filters.urgentHighOnly,
    filters.netaIncompleteOnly,
    filters.missingNetaReportOnly,
    filters.createdYesterdayOnly,
    filters.createdSinceBaselineOnly,
    filters.resolvedSinceBaselineOnly,
  ].filter(Boolean).length;

  return (
    <CollapsibleFilterCard activeCount={activeFilterCount}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SearchField
            label="Search by Case ID"
            onChange={(caseSearch) => update({ caseSearch })}
            placeholder="Search case ID"
            value={filters.caseSearch}
          />
          <SearchField
            label="Search by Equipment ID"
            onChange={(equipmentSearch) => update({ equipmentSearch })}
            placeholder="Search equipment ID"
            value={filters.equipmentSearch}
          />
          <SearchField
            label="Search by PDM Name"
            onChange={(pdmSearch) => update({ pdmSearch })}
            placeholder="Search PDM name"
            value={filters.pdmSearch}
          />
          <SearchField
            label="Search Summary"
            onChange={(summarySearch) => update({ summarySearch })}
            placeholder="Search issue summary"
            value={filters.summarySearch}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectFilter
            allLabel="All statuses"
            label="Status"
            onChange={(status) => update({ status })}
            options={statuses}
            value={filters.status}
          />
          <SelectFilter
            allLabel="All priorities"
            label="Priority"
            onChange={(priority) => update({ priority })}
            options={priorities}
            value={filters.priority}
          />
          <AssigneeMultiFilter
            onChange={(assignedTo) => update({ assignedTo })}
            options={assignees}
            value={filters.assignedTo}
          />
          <SelectFilter
            allLabel="All due states"
            label="Due State"
            onChange={(dueState) => update({ dueState: dueState as IssueFiltersState["dueState"] })}
            options={dueStates}
            value={filters.dueState}
          />
          <div className="flex items-end">
            <Button className="w-full" onClick={onReset} type="button" variant="ghost">
              Reset
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ToggleButton active={filters.openOnly} onClick={() => update({ openOnly: !filters.openOnly })}>
            Open issues
          </ToggleButton>
          <ToggleButton
            active={filters.missingImageOnly}
            onClick={() => update({ missingImageOnly: !filters.missingImageOnly })}
          >
            Missing image
          </ToggleButton>
          <ToggleButton
            active={filters.urgentHighOnly}
            onClick={() => update({ urgentHighOnly: !filters.urgentHighOnly })}
          >
            Urgent / high priority
          </ToggleButton>
          <ToggleButton
            active={filters.netaIncompleteOnly}
            onClick={() => update({ netaIncompleteOnly: !filters.netaIncompleteOnly })}
          >
            Equipment NETA incomplete
          </ToggleButton>
          <ToggleButton
            active={filters.missingNetaReportOnly}
            onClick={() => update({ missingNetaReportOnly: !filters.missingNetaReportOnly })}
          >
            Missing NETA test report
          </ToggleButton>
        </div>
    </CollapsibleFilterCard>
  );
}
