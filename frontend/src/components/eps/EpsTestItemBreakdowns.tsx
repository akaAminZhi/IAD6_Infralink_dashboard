import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "../common/StatusBadge";
import { EmptyState } from "../common/EmptyState";
import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import type { EpsTestItemRecord } from "../../types/data";
import type { EpsTestItemFilter } from "../../utils/epsExecutionFilters";
import { buildFailureHistoryTrackerTypeBreakdown, buildTestItemBreakdown, countTestItemResults, testItemFilterLabel } from "../../utils/epsExecutionBreakdown";

export function EpsTestItemBreakdowns({
  activeFilter,
  activeTrackerType,
  items,
  onSelectAllFailureHistory,
  onSelectFilter,
  onSelectTrackerType,
}: {
  activeFilter: EpsTestItemFilter;
  activeTrackerType: string;
  items: EpsTestItemRecord[];
  onSelectAllFailureHistory: () => void;
  onSelectFilter: (filter: EpsTestItemFilter) => void;
  onSelectTrackerType: (trackerType: string) => void;
}) {
  const counts = useMemo(() => countTestItemResults(items), [items]);
  const resultChart = useMemo(() => buildTestItemBreakdown(counts, items.length), [counts, items.length]);
  const failureChart = useMemo(() => buildFailureHistoryTrackerTypeBreakdown(items), [items]);

  return (
    <div className="eps-analysis-grid">
      <TestItemBreakdownPanel
        activeFilter={activeFilter}
        counts={counts}
        data={resultChart}
        onSelectFilter={onSelectFilter}
        total={items.length}
      />
      <FailureHistoryTrackerTypeBreakdownPanel
        activeTestItemFilter={activeFilter}
        activeTrackerType={activeTrackerType}
        counts={counts}
        data={failureChart}
        onSelectAllFailureHistory={onSelectAllFailureHistory}
        onSelectTrackerType={onSelectTrackerType}
      />
    </div>
  );
}

function TestItemBreakdownPanel({
  activeFilter,
  counts,
  data,
  onSelectFilter,
  total,
}: {
  activeFilter: EpsTestItemFilter;
  counts: ReturnType<typeof countTestItemResults>;
  data: ReturnType<typeof buildTestItemBreakdown>;
  onSelectFilter: (filter: EpsTestItemFilter) => void;
  total: number;
}) {
  const activeLabel = testItemFilterLabel(activeFilter);
  const { Failed: currentFailedCount, Fixed: fixedAfterFailureCount } = counts;
  const failureHistoryCount = currentFailedCount + fixedAfterFailureCount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Test Item Breakdown</CardTitle>
            <CardDescription>Select a result to filter the PDM and test item tables.</CardDescription>
          </div>
          <StatusBadge
            tone={
              activeFilter === "Failure History" || activeFilter === "Fixed"
                ? "teal"
                : activeFilter
                  ? "default"
                  : "muted"
            }
          >
            {activeFilter ? `${activeLabel} filter` : "All test items"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="eps-item-breakdown">
          <div aria-label="Test item status distribution" className="eps-status-track">
            {data.filter((entry) => entry.value > 0).map((entry) => (
              <button
                aria-label={`${entry.name}: ${formatNumber(entry.value)} test items`}
                aria-pressed={activeFilter === entry.id}
                className="eps-status-segment"
                key={entry.id}
                onClick={() => onSelectFilter(entry.id)}
                style={{ flexGrow: entry.value, backgroundColor: entry.color }}
                title={`${entry.name}: ${formatNumber(entry.value)}`}
                type="button"
              />
            ))}
          </div>
          <div className="eps-breakdown-legend">
            <button
              aria-pressed={!activeFilter}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60",
                !activeFilter ? "border-primary bg-primary/5" : "",
              )}
              onClick={() => onSelectFilter("")}
              type="button"
            >
              <div className="text-xs font-medium text-muted-foreground">Total test items</div>
              <div className="mt-1 text-2xl font-semibold tracking-normal">{formatNumber(total)}</div>
            </button>
            <button
              aria-pressed={activeFilter === "Failure History"}
              className={cn(
                "w-full border-l-4 border-l-teal-500 bg-teal-50/50 px-3 py-2 text-left transition-colors hover:bg-teal-50",
                activeFilter === "Failure History" ? "ring-2 ring-teal-500" : "",
              )}
              onClick={() => onSelectFilter("Failure History")}
              type="button"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div>
                  <div className="text-xs font-semibold text-teal-800">Failure History</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal text-red-600">
                    {formatNumber(failureHistoryCount)}
                  </div>
                </div>
                <div className="space-y-1 text-right text-xs font-medium">
                  <div className="font-semibold text-red-900">
                    {formatNumber(currentFailedCount)} current failed
                  </div>
                  <div className="text-teal-700">
                    {formatNumber(fixedAfterFailureCount)} fixed after failure
                  </div>
                </div>
              </div>
            </button>
            {data.map((entry) => (
              <button
                aria-pressed={activeFilter === entry.id}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  activeFilter === entry.id ? "border-primary bg-primary/5" : "",
                )}
                key={entry.id}
                onClick={() => onSelectFilter(entry.id)}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate font-medium">{entry.name}</span>
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {formatNumber(entry.value)} - {entry.percent === 0 && entry.value > 0 ? "<1%" : `${entry.percent}%`}
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FailureHistoryTrackerTypeBreakdownPanel({
  activeTestItemFilter,
  activeTrackerType,
  counts,
  data,
  onSelectAllFailureHistory,
  onSelectTrackerType,
}: {
  activeTestItemFilter: EpsTestItemFilter;
  activeTrackerType: string;
  counts: ReturnType<typeof countTestItemResults>;
  data: ReturnType<typeof buildFailureHistoryTrackerTypeBreakdown>;
  onSelectAllFailureHistory: () => void;
  onSelectTrackerType: (trackerType: string) => void;
}) {
  const total = counts.Failed + counts.Fixed;
  const { Failed: currentFailedCount, Fixed: fixedAfterFailureCount } = counts;
  const isFailureHistoryFilterActive = activeTestItemFilter === "Failure History";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Failure History by Tracker Type</CardTitle>
            <CardDescription>
              Current Failed and Fixed After Failure test items grouped by EPS tracker type.
            </CardDescription>
          </div>
          <StatusBadge tone={isFailureHistoryFilterActive || activeTrackerType ? "teal" : "muted"}>
            {activeTrackerType
              ? `Failure History + ${activeTrackerType}`
              : isFailureHistoryFilterActive
                ? "Failure History filter"
                : "All historical failure types"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState title="No failure history found." />
        ) : (
          <div className="eps-failure-breakdown">
            <div className="space-y-3">
              <button
                aria-pressed={isFailureHistoryFilterActive && !activeTrackerType}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60",
                  isFailureHistoryFilterActive && !activeTrackerType
                    ? "border-teal-400 bg-teal-50/70"
                    : "",
                )}
                onClick={onSelectAllFailureHistory}
                type="button"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  Total Historical Failures
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-normal">{formatNumber(total)}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                  <span className="text-red-700">{formatNumber(currentFailedCount)} current failed</span>
                  <span className="text-teal-700">
                    {formatNumber(fixedAfterFailureCount)} fixed after failure
                  </span>
                </div>
              </button>
              {data.map((entry) => {
                const isActive =
                  isFailureHistoryFilterActive &&
                  activeTrackerType.toLowerCase() === entry.id.toLowerCase();

                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      isActive ? "border-primary bg-primary/5" : "",
                    )}
                    key={entry.id}
                    onClick={() => onSelectTrackerType(entry.id)}
                    title={entry.name}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate font-medium">{entry.name}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatNumber(entry.value)} - {entry.percent === 0 && entry.value > 0 ? "<1%" : `${entry.percent}%`}
                    </span>
                    <span aria-hidden="true" className="eps-type-track">
                      <span style={{ width: `${(entry.value / Math.max(...data.map((row) => row.value), 1)) * 100}%`, backgroundColor: entry.color }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
