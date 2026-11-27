import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCheck, Minus, Wrench } from "lucide-react";
import { useState } from "react";
import type { EpsTestSummary } from "../../types/data";
import { cn } from "../../utils/cn";
import { getActivityEquipmentValues, getActivityHistory } from "../../utils/epsExecutionActivity";
import type { EpsActivityFilter } from "../../utils/epsExecutionFilters";
import { formatNumber } from "../../utils/formatters";
import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EpsAdvancedActivity } from "./EpsAdvancedActivity";
import { formatSnapshotDate } from "./executionPresentation";

function makeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  higherIsGood: boolean,
) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  ) {
    return null;
  }

  const delta = current - previous;
  if (delta === 0) {
    return {
      className: "text-muted-foreground",
      Icon: Minus,
      label: "No change vs previous 7d",
    };
  }

  const isBetter = higherIsGood ? delta > 0 : delta < 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  const sign = delta > 0 ? "+" : "-";

  return {
    className: isBetter ? "text-emerald-700" : "text-red-700",
    Icon,
    label: `${sign}${formatNumber(Math.abs(delta))} vs previous 7d`,
  };
}

function buildRecentActivityCards(summary: EpsTestSummary) {
  const sevenDay = summary.seven_day;
  const previousSevenDay = summary.previous_seven_day;
  const sevenDayAvailable = Boolean(sevenDay?.available);
  const yesterdayAvailable = Boolean(summary.yesterday?.available);
  return [
    {
      count: summary.yesterday?.new_tested_count ?? 0,
      enabled: yesterdayAvailable && getActivityEquipmentValues(summary, "yesterdayPassed").length > 0,
      filter: "yesterdayPassed" as const,
      icon: Activity,
      iconClassName: "text-blue-700",
      label: "Yesterday Passed",
      note: `Daily report date ${formatSnapshotDate(summary.yesterday?.source_date_label)}`,
      tone: "border-blue-200 bg-blue-50/70 text-blue-950",
      trend: null,
    },
    {
      count: summary.yesterday?.new_failed_count ?? 0,
      enabled: yesterdayAvailable && getActivityEquipmentValues(summary, "yesterdayFailed").length > 0,
      filter: "yesterdayFailed" as const,
      icon: AlertTriangle,
      iconClassName: (summary.yesterday?.new_failed_count ?? 0) > 0 ? "text-red-700" : "text-slate-500",
      label: "Yesterday Failed",
      note: "Failed items from yesterday daily report.",
      tone: (summary.yesterday?.new_failed_count ?? 0) > 0
        ? "border-red-300 bg-red-50/80 text-red-950"
        : "border-slate-200 bg-slate-50/70 text-slate-950",
      trend: null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.new_tested_count ?? 0 : null,
      enabled: sevenDayAvailable && getActivityEquipmentValues(summary, "sevenDayPassed").length > 0,
      filter: "sevenDayPassed" as const,
      icon: CheckCheck,
      iconClassName: "text-emerald-700",
      label: "7-Day Passed",
      note: sevenDayAvailable
        ? `${formatSnapshotDate(sevenDay?.baseline_date)} to ${formatSnapshotDate(sevenDay?.current_date)}`
        : "Waiting for EPS history snapshots.",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.new_tested_count, previousSevenDay?.new_tested_count, true)
        : null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.new_failed_count ?? 0 : null,
      enabled: sevenDayAvailable && getActivityEquipmentValues(summary, "sevenDayFailed").length > 0,
      filter: "sevenDayFailed" as const,
      icon: AlertTriangle,
      iconClassName: "text-red-700",
      label: "7-Day Failed",
      note: sevenDayAvailable ? "New failed equipment since EPS baseline." : "Waiting for EPS history snapshots.",
      tone: "border-red-300 bg-red-50/80 text-red-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.new_failed_count, previousSevenDay?.new_failed_count, false)
        : null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.repaired_count ?? 0 : null,
      enabled: sevenDayAvailable && getActivityEquipmentValues(summary, "sevenDayRepaired").length > 0,
      filter: "sevenDayRepaired" as const,
      icon: Wrench,
      iconClassName: "text-emerald-700",
      label: "7-Day Repaired",
      note: sevenDayAvailable ? "Previously failed equipment now tested." : "Waiting for EPS history snapshots.",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.repaired_count, previousSevenDay?.repaired_count, true)
        : null,
    },
  ];
}

export function EpsActivityCards({
  activeFilter,
  onSelectFilter,
  summary,
}: {
  activeFilter: EpsActivityFilter;
  onSelectFilter: (filter: EpsActivityFilter, equipmentValues?: string[]) => void;
  summary: EpsTestSummary;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const cards = buildRecentActivityCards(summary);
  const history = getActivityHistory(summary);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Recent testing activity</CardTitle>
          <CardDescription>
            Daily passed equipment and 7-day execution movement from EPS snapshots.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeFilter ? <StatusBadge tone="default">Activity filter active</StatusBadge> : null}
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-expanded={advancedOpen}
            aria-controls="eps-advanced-activity"
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            {advancedOpen ? "Hide Advanced" : "Advanced"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="eps-activity-grid">
          {cards.map((card) => {
            const Icon = card.icon;
            const isActive = activeFilter === card.filter;
            const value = card.count === null ? "--" : formatNumber(card.count);

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "eps-activity-cell rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  card.tone,
                  isActive ? "ring-2 ring-primary" : "hover:border-primary/50",
                  !card.enabled ? "cursor-not-allowed opacity-70 hover:translate-y-0 hover:shadow-none" : "",
                )}
                disabled={!card.enabled}
                key={card.filter}
                onClick={() => onSelectFilter(card.filter)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium text-muted-foreground">{card.label}</div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                    <Icon className={`h-5 w-5 ${card.iconClassName}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-normal">{value}</div>
                {card.trend ? (
                  <div
                    className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${card.trend.className}`}
                  >
                    <card.trend.Icon className="h-4 w-4" aria-hidden="true" />
                    {card.trend.label}
                  </div>
                ) : <div aria-hidden="true" className="mt-2 h-5" />}
                <div className="mt-2 text-xs font-medium text-muted-foreground">
                  {isActive ? "Filtered" : card.note}
                </div>
              </button>
            );
          })}
        </div>
        <EpsAdvancedActivity
          key={JSON.stringify([history.defaultCurrentDate, history.defaultBaselineDate])}
          activeFilter={activeFilter}
          history={history}
          onSelectFilter={onSelectFilter}
          open={advancedOpen}
        />
      </CardContent>
    </Card>
  );
}
