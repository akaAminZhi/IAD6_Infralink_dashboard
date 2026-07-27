import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileWarning,
  ImageOff,
  TrendingUp,
} from "lucide-react";

import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import type { HistoryComparison } from "../../types/data";
import type { EquipmentSummaryMetrics } from "../../utils/equipmentUtils";

export type EquipmentQuickFilter =
  | "openCases"
  | "missingNetaReport"
  | "missingIssueImages"
  | "netaComplete"
  | "recentNetaComplete"
  | "cxalloyPending";

interface EquipmentSummaryCardsProps {
  activeFilter: EquipmentQuickFilter | null;
  historyComparison: HistoryComparison | null;
  metrics: EquipmentSummaryMetrics;
  newNetaCompleteCount: number;
  onSelectFilter: (filter: EquipmentQuickFilter) => void;
}

function formatSnapshotDate(value: string | null | undefined): string {
  if (!value) {
    return "No baseline";
  }

  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }

  return `${Number(parts[1])}/${Number(parts[2])}/${parts[0]}`;
}

export function EquipmentSummaryCards({
  activeFilter,
  historyComparison,
  metrics,
  newNetaCompleteCount,
  onSelectFilter,
}: EquipmentSummaryCardsProps) {
  const netaHistory = historyComparison?.neta_complete ?? null;
  const baselineDate = formatSnapshotDate(netaHistory?.baseline_date);

  const exceptions = [
    {
      description: "GC report packages not confirmed as uploaded.",
      filter: "cxalloyPending" as const,
      icon: CloudUpload,
      label: "Pending CxAlloy Upload",
      value: metrics.cxalloyPendingEquipment,
      activeClass: "text-blue-700",
      alertClass: "text-blue-700",
    },
    {
      description: "NETA complete equipment missing report evidence.",
      filter: "missingNetaReport" as const,
      icon: FileWarning,
      label: "Missing NETA Report",
      value: metrics.missingNetaReports,
      activeClass: "text-red-700",
      alertClass: "text-red-700",
    },
    {
      description: "Related cases without issue image references.",
      filter: "missingIssueImages" as const,
      icon: ImageOff,
      label: "Missing Issue Images",
      value: metrics.casesMissingIssueImage,
      activeClass: "text-amber-700",
      alertClass: "text-amber-700",
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-slate-50/60 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Equipment Readiness & Exceptions</CardTitle>
          <CardDescription>Use each metric to filter the equipment lookup table.</CardDescription>
        </div>
        <StatusBadge tone="muted">
          {`${formatNumber(metrics.uniqueEquipmentIds)} unique equipment IDs`}
        </StatusBadge>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid xl:grid-cols-[1.45fr_0.9fr]">
          <div className="grid border-b sm:grid-cols-[1fr_0.65fr] xl:border-b-0 xl:border-r">
            <button
              aria-pressed={activeFilter === "netaComplete"}
              className={cn(
                "flex min-h-32 items-center gap-4 border-b px-5 py-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:border-b-0 sm:border-r",
                activeFilter === "netaComplete" ? "bg-emerald-50/70" : "bg-background",
              )}
              onClick={() => onSelectFilter("netaComplete")}
              type="button"
            >
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  NETA Complete With Report
                </div>
                <div className="mt-1 text-3xl font-semibold text-emerald-800">
                  {formatNumber(metrics.netaComplete)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Complete equipment with report evidence
                </div>
              </div>
            </button>

            <button
              aria-pressed={activeFilter === "recentNetaComplete"}
              className={cn(
                "flex min-h-32 items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                activeFilter === "recentNetaComplete" ? "bg-blue-50/70" : "bg-background",
              )}
              disabled={!netaHistory?.available && newNetaCompleteCount === 0}
              onClick={() => onSelectFilter("recentNetaComplete")}
              type="button"
            >
              <TrendingUp className="h-6 w-6 shrink-0 text-blue-700" aria-hidden="true" />
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Added In 7 Days
                </div>
                <div className="mt-1 text-3xl font-semibold text-blue-800">
                  +{formatNumber(newNetaCompleteCount)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Since {baselineDate}</div>
              </div>
            </button>
          </div>

          <button
            aria-pressed={activeFilter === "openCases"}
            className={cn(
              "flex min-h-32 items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              activeFilter === "openCases" ? "bg-red-50/70" : "bg-background",
            )}
            onClick={() => onSelectFilter("openCases")}
            type="button"
          >
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Equipment With Open Cases
              </div>
              <div className="mt-1 text-3xl font-semibold text-red-800">
                {formatNumber(metrics.equipmentWithOpenCases)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Highest-priority equipment workload
              </div>
            </div>
          </button>
        </div>

        <div className="grid border-t lg:grid-cols-3">
          {exceptions.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeFilter === item.filter;
            const hasException = item.value > 0;
            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "flex min-h-24 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  index < exceptions.length - 1 ? "border-b lg:border-b-0 lg:border-r" : "",
                  isActive ? "bg-blue-50/70" : "bg-background",
                )}
                key={item.filter}
                onClick={() => onSelectFilter(item.filter)}
                type="button"
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    hasException ? item.alertClass : "text-emerald-700",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {item.label}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-xl font-semibold",
                      hasException ? item.activeClass : "text-slate-700",
                    )}
                  >
                    {formatNumber(item.value)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasException ? item.description : "No current exception"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
