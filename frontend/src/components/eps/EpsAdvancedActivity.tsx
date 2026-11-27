import { useState } from "react";
import { cn } from "../../utils/cn";
import { getAdvancedActivityEquipment, type getActivityHistory } from "../../utils/epsExecutionActivity";
import type { EpsActivityFilter } from "../../utils/epsExecutionFilters";
import { formatNumber } from "../../utils/formatters";
import { EmptyState } from "../common/EmptyState";
import { formatSnapshotDate } from "./executionPresentation";

type AdvancedFilter = keyof ReturnType<typeof getAdvancedActivityEquipment>;

const dailyResults = [
  { filter: "advancedDailyPassed", label: "Passed", failed: false },
  { filter: "advancedDailyFailed", label: "Failed", failed: true },
] as const;

const cumulativeResults = [
  { filter: "advancedCumulativePassed", label: "New Passed", failed: false },
  { filter: "advancedCumulativeFailed", label: "New Failed", failed: true },
] as const;

function DateField({
  className, dates, label, onChange, value,
}: {
  className: string;
  dates: string[];
  label: string;
  onChange: (date: string) => void;
  value: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm font-medium", className)}>
      {label}
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {dates.map((date) => (
          <option key={date} value={date}>{formatSnapshotDate(date)}</option>
        ))}
      </select>
    </label>
  );
}

function AdvancedResultButtons({
  activeFilter, dateLabel, equipment, onSelectFilter, results,
}: {
  activeFilter: EpsActivityFilter;
  dateLabel: string;
  equipment: ReturnType<typeof getAdvancedActivityEquipment>;
  onSelectFilter: (filter: AdvancedFilter, equipmentValues: string[]) => void;
  results: ReadonlyArray<{ filter: AdvancedFilter; label: string; failed: boolean }>;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {results.map(({ filter, label, failed }) => {
        const items = equipment[filter];
        const isActive = activeFilter === filter;
        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "rounded-md border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
              failed ? "border-red-300 bg-red-50/80 text-red-950" : "border-emerald-200 bg-emerald-50/70 text-emerald-950",
              isActive && "ring-2 ring-primary",
            )}
            disabled={items.length === 0}
            key={filter}
            onClick={() => onSelectFilter(filter, items)}
            type="button"
          >
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-normal">{formatNumber(items.length)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{dateLabel}</div>
          </button>
        );
      })}
    </div>
  );
}

export function EpsAdvancedActivity({
  activeFilter, history, onSelectFilter, open,
}: {
  activeFilter: EpsActivityFilter;
  history: ReturnType<typeof getActivityHistory>;
  onSelectFilter: (filter: AdvancedFilter, equipmentValues: string[]) => void;
  open: boolean;
}) {
  const [dailyDate, setDailyDate] = useState(history.defaultCurrentDate);
  const [currentDate, setCurrentDate] = useState(history.defaultCurrentDate);
  const [baselineDate, setBaselineDate] = useState(history.defaultBaselineDate);

  if (!open) {
    return null;
  }

  const equipment = getAdvancedActivityEquipment(history.entries, dailyDate, baselineDate, currentDate);

  return (
    <div id="eps-advanced-activity" className="mt-4 rounded-md border bg-muted/20 p-4">
      {history.entries.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold">Daily Activity Baseline</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Choose one report date, then filter passed or failed test items from that day.
                </div>
              </div>
              <DateField className="min-w-[180px]" dates={history.dates} label="Date" onChange={setDailyDate} value={dailyDate} />
            </div>
            <AdvancedResultButtons
              activeFilter={activeFilter}
              dateLabel={formatSnapshotDate(dailyDate)}
              equipment={equipment}
              onSelectFilter={onSelectFilter}
              results={dailyResults}
            />
          </div>

          <div className="rounded-md border bg-background p-4">
            <div>
              <div className="text-sm font-semibold">Cumulative Date Comparison</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Compare cumulative execution between two report dates.
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DateField className="min-w-0" dates={history.dates} label="Baseline" onChange={setBaselineDate} value={baselineDate} />
              <DateField className="min-w-0" dates={history.dates} label="Current" onChange={setCurrentDate} value={currentDate} />
            </div>
            <AdvancedResultButtons
              activeFilter={activeFilter}
              dateLabel={`${formatSnapshotDate(baselineDate)} to ${formatSnapshotDate(currentDate)}`}
              equipment={equipment}
              onSelectFilter={onSelectFilter}
              results={cumulativeResults}
            />
          </div>
        </div>
      ) : (
        <EmptyState title="No daily EPS history is available." />
      )}
    </div>
  );
}
