import { AlertTriangle, CheckCircle2, FileWarning, ImageOff, TrendingUp } from "lucide-react";

import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import type { HistoryComparison } from "../../types/data";
import type { EquipmentSummaryMetrics } from "../../utils/equipmentUtils";

export type EquipmentQuickFilter =
  | "openCases"
  | "missingNetaReport"
  | "missingIssueImages"
  | "netaComplete"
  | "recentNetaComplete";

interface EquipmentSummaryCardsProps {
  activeFilter: EquipmentQuickFilter | null;
  historyComparison: HistoryComparison | null;
  metrics: EquipmentSummaryMetrics;
  newNetaCompleteCount: number;
  onSelectFilter: (filter: EquipmentQuickFilter) => void;
}

const cardToneClass = {
  positive: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
  warning: "border-amber-200 bg-amber-50/70 text-amber-950",
  critical: "border-red-200 bg-red-50/70 text-red-950",
};

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
  const cards = [
    {
      description: "Equipment entries with active cases.",
      filter: "openCases" as const,
      icon: AlertTriangle,
      label: "Equipment With Open Cases",
      tone: "warning" as const,
      value: metrics.equipmentWithOpenCases,
    },
    {
      description: "NETA complete but report is missing.",
      filter: "missingNetaReport" as const,
      icon: FileWarning,
      label: "Missing NETA Test Report",
      tone: "critical" as const,
      value: metrics.missingNetaReports,
    },
    {
      description: "Related cases missing image references.",
      filter: "missingIssueImages" as const,
      icon: ImageOff,
      label: "Cases Missing Issue Image",
      tone: "critical" as const,
      value: metrics.casesMissingIssueImage,
    },
    {
      description: "Complete with report available.",
      filter: "netaComplete" as const,
      icon: CheckCircle2,
      label: "NETA Complete With Report",
      tone: "positive" as const,
      value: metrics.netaComplete,
    },
  ];
  const netaHistory = historyComparison?.neta_complete ?? null;
  const recentNetaActive = activeFilter === "recentNetaComplete";
  const baselineDate = formatSnapshotDate(netaHistory?.baseline_date);
  const currentCount = netaHistory?.current_count ?? metrics.netaComplete;
  const baselineCount = netaHistory?.baseline_count ?? null;

  return (
    <section className="grid gap-4">
      <button
        aria-pressed={recentNetaActive}
        className={cn(
          "rounded-lg border-2 p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          recentNetaActive
            ? "border-primary bg-primary/5"
            : "border-emerald-200 bg-emerald-50/60 text-emerald-950",
        )}
        disabled={!netaHistory?.available && newNetaCompleteCount === 0}
        onClick={() => onSelectFilter("recentNetaComplete")}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-md",
                recentNetaActive ? "bg-primary text-primary-foreground" : "bg-emerald-100 text-emerald-900",
              )}
            >
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-semibold">NETA Complete Added Since 7-Day Baseline</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Compared with {baselineDate}; current complete {formatNumber(currentCount)}
                {baselineCount === null ? "" : `, baseline ${formatNumber(baselineCount)}`}.
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold leading-none tracking-normal">
              +{formatNumber(newNetaCompleteCount)}
            </div>
            <div className="mt-2 text-xs font-medium text-primary">
              {recentNetaActive ? "Filtering lookup table" : "Click to filter"}
            </div>
          </div>
        </div>
      </button>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isActive = activeFilter === card.filter;

          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "rounded-lg border p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cardToneClass[card.tone],
                isActive ? "border-primary ring-2 ring-primary/20" : "",
              )}
              key={card.filter}
              onClick={() => onSelectFilter(card.filter)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-muted-foreground">{card.label}</div>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-normal">
                {formatNumber(card.value)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{card.description}</div>
              <div className="mt-3 text-xs font-medium text-primary">
                {isActive ? "Filtering lookup table" : "Click to filter"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
