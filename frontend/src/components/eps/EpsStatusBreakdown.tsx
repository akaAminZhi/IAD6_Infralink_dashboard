import { AlertTriangle, CheckCheck, CircleDashed, FileClock, TimerReset, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { EpsTestSummary } from "../../types/data";
import { formatNumber } from "../../utils/formatters";
import {
  STATUS_COMPLETE, STATUS_FAILED, STATUS_NO_TRACKER_RECORDS, STATUS_NOT_STARTED,
  STATUS_PARTIAL, STATUS_WAITING_INFRALINK_NETA,
} from "../../utils/epsExecutionStatus";

export function StatusBreakdown({
  activeStatus,
  onSelectStatus,
  summary,
}: {
  activeStatus: string;
  onSelectStatus: (status: string) => void;
  summary: EpsTestSummary;
}) {
  const rows = [
    {
      label: STATUS_COMPLETE,
      count: summary.complete_count,
      icon: <CheckCheck className="h-5 w-5 text-emerald-700" />,
      className: "border-emerald-200 bg-emerald-50/60",
    },
    {
      label: STATUS_WAITING_INFRALINK_NETA,
      count: summary.waiting_infralink_neta_count,
      icon: <FileClock className="h-5 w-5 text-amber-700" />,
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: STATUS_PARTIAL,
      count: summary.partial_count,
      icon: <TimerReset className="h-5 w-5 text-amber-700" />,
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: STATUS_FAILED,
      count: summary.failed_count,
      icon: <AlertTriangle className="h-5 w-5 text-red-700" />,
      className: "border-red-300 bg-red-50/80",
    },
    {
      label: STATUS_NOT_STARTED,
      count: summary.not_started_count,
      icon: <CircleDashed className="h-5 w-5 text-slate-500" />,
      className: "border-border bg-background",
    },
    {
      label: STATUS_NO_TRACKER_RECORDS,
      count: summary.no_tracker_record_count,
      icon: <Wrench className="h-5 w-5 text-slate-500" />,
      className: "border-border bg-background",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module equipment status</CardTitle>
        <CardDescription>
          Field-test status by module equipment, separate from Infralink NETA closeout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="eps-module-status-grid">
          {rows.map((row) => (
            <button
              aria-label={row.label}
              aria-pressed={activeStatus === row.label}
              className={`eps-module-status rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${row.className} ${
                activeStatus === row.label
                  ? "ring-2 ring-primary"
                  : "hover:border-primary/50"
              }`}
              key={row.label}
              onClick={() => onSelectStatus(row.label)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {row.label === STATUS_WAITING_INFRALINK_NETA ? "Awaiting Infralink NETA" : row.label}
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                  {row.icon}
                </div>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-normal">
                {formatNumber(row.count)}
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">
                {activeStatus === row.label ? "Filtered" : "Click to filter"}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
