import {
  AlertTriangle,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CirclePlay,
  FileWarning,
  ImageOff,
  ShieldCheck,
} from "lucide-react";

import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import {
  hasNetaTestingStarted,
  type PdmSummaryMetrics,
  type PdmTableRow,
} from "../../utils/pdmUtils";

export type PdmSummaryFilter =
  | "testingStarted"
  | "fullyReady"
  | "needsAttention"
  | "watch"
  | "attention"
  | "critical"
  | "notStarted"
  | "openCases"
  | "missingReports"
  | "missingImages";

interface PdmSummaryCardsProps {
  activeFilter: PdmSummaryFilter | null;
  metrics: PdmSummaryMetrics;
  onSelectFilter: (filter: PdmSummaryFilter) => void;
  rows: PdmTableRow[];
}

export function PdmSummaryCards({
  activeFilter,
  metrics,
  onSelectFilter,
  rows,
}: PdmSummaryCardsProps) {
  const testingStarted = rows.filter((row) => hasNetaTestingStarted(row.pdm)).length;
  const readinessCounts = {
    ready: rows.filter((row) => row.readinessLevel === "Good").length,
    watch: rows.filter((row) => row.readinessLevel === "Watch").length,
    attention: rows.filter((row) => row.readinessLevel === "Attention").length,
    critical: rows.filter((row) => row.readinessLevel === "Critical").length,
    notStarted: rows.filter((row) => row.readinessLevel === "Not Started").length,
  };
  const totalPdms = Math.max(metrics.totalPdms, 1);

  const readiness = [
    {
      filter: "fullyReady" as const,
      label: "Ready",
      value: readinessCounts.ready,
      icon: ShieldCheck,
      accent: "border-t-emerald-500",
      iconClass: "text-emerald-700",
      barClass: "bg-emerald-500",
      dotClass: "bg-emerald-500",
    },
    {
      filter: "watch" as const,
      label: "Watch",
      value: readinessCounts.watch,
      icon: CircleDot,
      accent: "border-t-blue-500",
      iconClass: "text-blue-700",
      barClass: "bg-blue-500",
      dotClass: "bg-blue-500",
    },
    {
      filter: "attention" as const,
      label: "Attention",
      value: readinessCounts.attention,
      icon: AlertTriangle,
      accent: "border-t-amber-500",
      iconClass: "text-amber-700",
      barClass: "bg-amber-500",
      dotClass: "bg-amber-500",
    },
    {
      filter: "critical" as const,
      label: "Critical",
      value: readinessCounts.critical,
      icon: CircleAlert,
      accent: "border-t-red-500",
      iconClass: "text-red-700",
      barClass: "bg-red-500",
      dotClass: "bg-red-500",
    },
    {
      filter: "notStarted" as const,
      label: "Not Started",
      value: readinessCounts.notStarted,
      icon: CircleDashed,
      accent: "border-t-slate-300",
      iconClass: "text-slate-500",
      barClass: "bg-slate-300",
      dotClass: "bg-slate-300",
    },
  ];

  const exceptions = [
    {
      filter: "openCases" as const,
      label: "Open Cases",
      value: `${formatNumber(metrics.pdmsWithOpenCases)} PDMs / ${formatNumber(metrics.totalOpenCases)} cases`,
      detail: "Active issue workload",
      icon: CircleAlert,
      iconClass: metrics.totalOpenCases > 0 ? "text-red-700" : "text-emerald-700",
    },
    {
      filter: "missingReports" as const,
      label: "Missing NETA Reports",
      value: formatNumber(metrics.netaMissingReports),
      detail: "Completed equipment missing evidence",
      icon: FileWarning,
      iconClass: metrics.netaMissingReports > 0 ? "text-red-700" : "text-emerald-700",
    },
    {
      filter: "missingImages" as const,
      label: "Missing Issue Images",
      value: formatNumber(metrics.casesMissingIssueImage),
      detail: "Cases missing image references",
      icon: ImageOff,
      iconClass: metrics.casesMissingIssueImage > 0 ? "text-amber-700" : "text-emerald-700",
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-slate-50/60 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>PDM Portfolio Readiness</CardTitle>
          <CardDescription>Use readiness and exception counts to filter the PDM table.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="muted">{`${formatNumber(metrics.totalPdms)} PDMs`}</StatusBadge>
          <StatusBadge tone="muted">{`${formatNumber(metrics.totalEquipment)} equipment`}</StatusBadge>
          <button
            aria-pressed={activeFilter === "testingStarted"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeFilter === "testingStarted"
                ? "border-blue-400 bg-blue-50 text-blue-800"
                : "border-border bg-background text-muted-foreground",
            )}
            onClick={() => onSelectFilter("testingStarted")}
            type="button"
          >
            <CirclePlay className="h-3.5 w-3.5" aria-hidden="true" />
            {formatNumber(testingStarted)} testing started
          </button>
          <StatusBadge tone="success">
            {`${formatNumber(metrics.netaComplete)} NETA complete`}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-2 xl:grid-cols-5">
          {readiness.map((item, index) => {
            const Icon = item.icon;
            const isActive =
              activeFilter === item.filter ||
              (activeFilter === "needsAttention" &&
                ["watch", "attention", "critical"].includes(item.filter));
            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "min-h-24 border-t-2 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  item.accent,
                  index < readiness.length - 1 ? "border-b xl:border-b-0 xl:border-r" : "",
                  index === readiness.length - 1 ? "col-span-2 xl:col-span-1" : "",
                  index % 2 === 0 && index < readiness.length - 1 ? "border-r xl:border-r" : "",
                  isActive ? "bg-blue-50/70" : "bg-background",
                )}
                key={item.filter}
                onClick={() => onSelectFilter(item.filter)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {item.label}
                  </span>
                  <Icon className={`h-4 w-4 ${item.iconClass}`} aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {formatNumber(item.value)}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t px-5 py-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {readiness.map((item) =>
              item.value > 0 ? (
                <div
                  className={item.barClass}
                  key={item.filter}
                  style={{ width: `${(item.value / totalPdms) * 100}%` }}
                  title={`${item.label}: ${item.value}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {readiness.map((item) => (
              <div className="flex items-center gap-2 text-xs" key={item.filter}>
                <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold text-slate-900">{formatNumber(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid border-t lg:grid-cols-3">
          {exceptions.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeFilter === item.filter;
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
                <Icon className={`h-5 w-5 shrink-0 ${item.iconClass}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.detail}</div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
