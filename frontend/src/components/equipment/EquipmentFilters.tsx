import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";

import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";

export type EquipmentNetaFilter =
  | ""
  | "complete"
  | "incomplete"
  | "complete_missing_report";

const netaFilterLabels: Record<EquipmentNetaFilter, string> = {
  "": "All",
  complete: "Complete with report",
  incomplete: "Incomplete / unknown",
  complete_missing_report: "Complete missing report",
};

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
  netaReportFailedOnly: boolean;
  netaReportReviewRequiredOnly: boolean;
  duplicateReports?: "" | "all" | "possible" | "confirmed";
}

interface EquipmentFiltersProps {
  duplicateReportsAvailable?: boolean;
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
        aria-label={label}
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
  duplicateReportsAvailable,
  filters,
  equipmentTypes,
  statuses,
  parents,
  onChange,
  onReset,
}: EquipmentFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
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
    filters.netaReportFailedOnly,
    filters.netaReportReviewRequiredOnly,
    filters.duplicateReports,
  ].filter(Boolean).length;
  const filterLabels: Record<keyof EquipmentFiltersState, string> = {
    equipmentSearch: "Equipment",
    pdmSearch: "PDM",
    equipmentType: "Equipment type",
    status: "Status",
    parent: "Parent",
    neta: "NETA",
    openCasesOnly: "Open cases",
    missingIssueImagesOnly: "Missing issue images",
    missingNetaReportOnly: "Missing NETA report",
    newNetaCompleteOnly: "Added in 7 days",
    cxalloyPendingOnly: "Pending CxAlloy upload",
    netaReportFailedOnly: "Failed NETA reports",
    netaReportReviewRequiredOnly: "NETA review required",
    duplicateReports: "Duplicate reports",
  };

  return (
    <Card className="equipment-filters">
      <CardContent className="space-y-4 p-4">
        <div className="equipment-search-heading">
          <h3>Find equipment</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-controls={advancedId}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
              type="button"
              variant="outline"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
              More filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}
              <ChevronDown className={`ml-2 h-4 w-4 ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
            <Button onClick={onReset} type="button" variant="ghost">
              <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Reset
            </Button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Equipment ID or source label
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
            PDM name
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

        {advancedOpen && (
          <div className="equipment-advanced-filters space-y-4" id={advancedId}>
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
                  aria-label="NETA"
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
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                Duplicate reports
                <select
                  aria-label="Duplicate reports"
                  disabled={duplicateReportsAvailable === false}
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={filters.duplicateReports ?? ""}
                  onChange={(event) => update({ duplicateReports: event.target.value as EquipmentFiltersState["duplicateReports"] })}
                >
                  <option value="">All reports</option>
                  <option value="all">All duplicate alerts</option>
                  <option value="possible">Possible duplicates</option>
                  <option value="confirmed">Confirmed duplicates</option>
                </select>
              </label>
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
              <ToggleButton
                active={filters.netaReportFailedOnly}
                onClick={() => update({ netaReportFailedOnly: !filters.netaReportFailedOnly })}
              >
                Failed NETA reports
              </ToggleButton>
              <ToggleButton
                active={filters.netaReportReviewRequiredOnly}
                onClick={() =>
                  update({ netaReportReviewRequiredOnly: !filters.netaReportReviewRequiredOnly })
                }
              >
                NETA reports requiring review
              </ToggleButton>
            </div>
          </div>
        )}
        {activeFilterCount > 0 && (
          <div aria-label="Active equipment filters" className="equipment-filter-chips">
            {(Object.keys(filterLabels) as Array<keyof EquipmentFiltersState>).filter((key) =>
              typeof filters[key] === "string" ? String(filters[key]).trim() : filters[key],
            ).map((key) => (
              <button
                aria-label={`Remove ${filterLabels[key]} filter`}
                key={key}
                onClick={() => update({ [key]: typeof filters[key] === "boolean" ? false : "" })}
                type="button"
              >
                <span>
                  {filterLabels[key]}
                  {key === "neta"
                    ? `: ${netaFilterLabels[filters.neta]}`
                    : typeof filters[key] === "string" ? `: ${filters[key]}` : ""}
                </span>
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
