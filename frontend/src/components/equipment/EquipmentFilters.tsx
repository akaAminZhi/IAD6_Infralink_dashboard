import { Search } from "lucide-react";

import { CollapsibleFilterCard } from "../common/CollapsibleFilterCard";
import { Button } from "../ui/button";

export type EquipmentNetaFilter =
  | ""
  | "complete"
  | "incomplete"
  | "complete_missing_report";

export interface EquipmentFiltersState {
  equipmentSearch: string;
  pdmSearch: string;
  equipmentType: string;
  status: string;
  parent: string;
  neta: EquipmentNetaFilter;
  openCasesOnly: boolean;
  missingIssueImagesOnly: boolean;
  missingNetaReportOnly: boolean;
  newNetaCompleteOnly: boolean;
  cxalloyPendingOnly: boolean;
}

interface EquipmentFiltersProps {
  filters: EquipmentFiltersState;
  equipmentTypes: string[];
  statuses: string[];
  parents: string[];
  onChange: (filters: EquipmentFiltersState) => void;
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

function SelectFilter({
  label,
  options,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
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

export function EquipmentFilters({
  filters,
  equipmentTypes,
  statuses,
  parents,
  onChange,
  onReset,
}: EquipmentFiltersProps) {
  function update(next: Partial<EquipmentFiltersState>) {
    onChange({ ...filters, ...next });
  }
  const activeFilterCount = [
    filters.equipmentSearch.trim(),
    filters.pdmSearch.trim(),
    filters.equipmentType,
    filters.status,
    filters.parent,
    filters.neta,
    filters.openCasesOnly,
    filters.missingIssueImagesOnly,
    filters.missingNetaReportOnly,
    filters.newNetaCompleteOnly,
    filters.cxalloyPendingOnly,
  ].filter(Boolean).length;

  return (
    <CollapsibleFilterCard activeCount={activeFilterCount}>
        <div className="grid gap-3 xl:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Search by Equipment ID or Source Label
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                onChange={(event) => update({ equipmentSearch: event.target.value })}
                placeholder="Search equipment ID or source label"
                type="search"
                value={filters.equipmentSearch}
              />
            </span>
          </label>

          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Search by PDM Name
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                onChange={(event) => update({ pdmSearch: event.target.value })}
                placeholder="Search PDM name"
                type="search"
                value={filters.pdmSearch}
              />
            </span>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectFilter
            allLabel="All equipment types"
            label="Equipment Type"
            onChange={(equipmentType) => update({ equipmentType })}
            options={equipmentTypes}
            value={filters.equipmentType}
          />
          <SelectFilter
            allLabel="All statuses"
            label="Status"
            onChange={(status) => update({ status })}
            options={statuses}
            value={filters.status}
          />
          <SelectFilter
            allLabel="All parents"
            label="Parent"
            onChange={(parent) => update({ parent })}
            options={parents}
            value={filters.parent}
          />
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            NETA
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) => update({ neta: event.target.value as EquipmentNetaFilter })}
              value={filters.neta}
            >
              <option value="">All</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
              <option value="complete_missing_report">Complete Missing Report</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button className="w-full" onClick={onReset} type="button" variant="ghost">
              Reset
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ToggleButton
            active={filters.openCasesOnly}
            onClick={() => update({ openCasesOnly: !filters.openCasesOnly })}
          >
            Open cases
          </ToggleButton>
          <ToggleButton
            active={filters.missingIssueImagesOnly}
            onClick={() => update({ missingIssueImagesOnly: !filters.missingIssueImagesOnly })}
          >
            Missing issue images
          </ToggleButton>
          <ToggleButton
            active={filters.missingNetaReportOnly}
            onClick={() => update({ missingNetaReportOnly: !filters.missingNetaReportOnly })}
          >
            Missing NETA test report
          </ToggleButton>
          <ToggleButton
            active={filters.cxalloyPendingOnly}
            onClick={() => update({ cxalloyPendingOnly: !filters.cxalloyPendingOnly })}
          >
            Pending CxAlloy upload
          </ToggleButton>
        </div>
    </CollapsibleFilterCard>
  );
}
