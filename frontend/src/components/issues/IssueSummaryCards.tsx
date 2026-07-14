import { CalendarClock, CalendarDays } from "lucide-react";
import { ResponsivePie } from "@nivo/pie";

import type { HistoryComparison } from "../../types/data";
import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import {
  isIssueCreatedYesterday,
  type EnrichedIssue,
  type IssueSummaryMetrics,
} from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface IssueSummaryCardsProps {
  issues: EnrichedIssue[];
  metrics: IssueSummaryMetrics;
  activeSevenDayFilter: YesterdayIssueFilter | null;
  activeYesterdayFilter: YesterdayIssueFilter | null;
  activeStatusFilter: string;
  historyComparison: HistoryComparison | null;
  onClearSevenDayFilter: () => void;
  onClearYesterdayFilter: () => void;
  onSelectSevenDayFilter: (filter: YesterdayIssueFilter) => void;
  onSelectStatusFilter: (status: string) => void;
  onSelectYesterdayFilter: (filter: YesterdayIssueFilter) => void;
}

export type YesterdayIssueFilter = "all" | "open" | "urgentHigh" | "missingImage" | "resolved";

interface ChartDatum {
  name: string;
  value: number;
  percent: number;
  color: string;
}

const STATUS_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#64748b", "#7c3aed"];
const STATUS_COLOR_BY_LABEL: Record<string, string> = {
  open: "#dc2626",
  acknowledged: "#f59e0b",
  resolved: "#16a34a",
  closed: "#16a34a",
  complete: "#16a34a",
  completed: "#16a34a",
  cancelled: "#64748b",
  canceled: "#64748b",
  void: "#64748b",
  unknown: "#64748b",
};

function normalizeLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  return label === "" ? "Unknown" : label;
}

function getStatusColor(label: string, index: number): string {
  return STATUS_COLOR_BY_LABEL[label.trim().toLowerCase()] ?? STATUS_COLORS[index % STATUS_COLORS.length];
}

function buildStatusBreakdown(issues: EnrichedIssue[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const label = normalizeLabel(issue.status);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = issues.length || 1;

  return sorted.map((item, index) => ({
    id: item.name,
    ...item,
    color: getStatusColor(item.name, index),
    percent: Math.round((item.value / total) * 100),
  }));
}

function StatusBreakdownPanel({
  data,
  activeStatusFilter,
  onSelectStatusFilter,
  total,
  openIssues,
}: {
  data: ChartDatum[];
  activeStatusFilter: string;
  onSelectStatusFilter: (status: string) => void;
  total: number;
  openIssues: number;
}) {
  const activeLabel = activeStatusFilter || "All";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
            <CardDescription>{formatNumber(openIssues)} open issues</CardDescription>
          </div>
          <StatusBadge tone={activeStatusFilter ? "default" : "muted"}>
            {activeStatusFilter ? `${activeLabel} filter` : "All statuses"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)] md:items-center">
          <div className="relative h-[300px] rounded-md border bg-muted/20 p-3">
            <ResponsivePie
              activeOuterRadiusOffset={8}
              arcLabel={(datum) => String(datum.value)}
              arcLabelsRadiusOffset={0.55}
              arcLabelsSkipAngle={8}
              arcLabelsTextColor="#ffffff"
              borderColor="#ffffff"
              borderWidth={2}
              colors={({ data: datum }) => datum.color}
              cornerRadius={3}
              data={data}
              enableArcLinkLabels={false}
              innerRadius={0.62}
              margin={{ top: 18, right: 18, bottom: 18, left: 18 }}
              onClick={(datum) => onSelectStatusFilter(String(datum.id))}
              padAngle={1}
              role="application"
              theme={{
                text: {
                  fill: "#0f172a",
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  fontSize: 12,
                },
                tooltip: {
                  container: {
                    borderRadius: 6,
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
                    fontSize: 12,
                  },
                },
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-card/95 px-5 py-4 text-center shadow-sm">
                <div className="text-3xl font-semibold leading-none tracking-normal">
                  {formatNumber(total)}
                </div>
                <div className="mt-1 text-xs font-medium uppercase text-muted-foreground">Issues</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border bg-background px-3 py-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Total Issues</div>
              <div className="mt-1 text-2xl font-semibold tracking-normal">
                {formatNumber(total)}
              </div>
            </div>
            {data.map((entry) => (
              <button
                aria-pressed={activeStatusFilter === entry.name}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  activeStatusFilter === entry.name ? "border-primary bg-primary/5" : "",
                )}
                key={entry.name}
                onClick={() => onSelectStatusFilter(entry.name)}
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
                  {formatNumber(entry.value)} - {entry.percent}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function normalizeCaseId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
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

function getIssuesByCaseIds(issues: EnrichedIssue[], caseIds: string[]): EnrichedIssue[] {
  const selectedIds = new Set(caseIds.map(normalizeCaseId).filter(Boolean));
  if (selectedIds.size === 0) {
    return [];
  }

  return issues.filter((issue) => selectedIds.has(normalizeCaseId(issue.case_id)));
}

function IssueCountButton({
  active,
  disabled,
  label,
  onClick,
  tone,
  value,
  variant = "normal",
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone: "amber" | "emerald" | "red";
  value: number;
  variant?: "normal" | "primary";
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "group rounded-md text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div
        className={cn(
          "font-semibold leading-none tracking-normal transition-colors group-hover:text-primary",
          variant === "primary" ? "text-6xl" : "text-5xl",
          tone === "emerald" && !active ? "text-emerald-700" : "",
          tone === "red" && !active ? "text-red-700" : "",
        )}
      >
        {formatNumber(value)}
      </div>
      <div className="mt-2 text-sm text-muted-foreground transition-colors group-hover:text-primary">
        {label}
      </div>
    </button>
  );
}

function NewIssuesCard({
  activeFilter,
  description,
  icon: Icon,
  issues,
  metrics,
  onClearFilter,
  onSelectFilter,
  resolvedIssues,
  title,
  tone,
}: {
  activeFilter: YesterdayIssueFilter | null;
  description: string;
  icon: typeof CalendarClock;
  issues: EnrichedIssue[];
  metrics: IssueSummaryMetrics;
  onClearFilter: () => void;
  onSelectFilter: (filter: YesterdayIssueFilter) => void;
  resolvedIssues?: EnrichedIssue[];
  title: string;
  tone: "amber" | "emerald";
}) {
  const resolvedCount = resolvedIssues?.length ?? 0;
  const isActive = activeFilter !== null;
  const toneClass =
    tone === "emerald"
      ? {
          active: "border-primary bg-primary/5",
          idle: "border-emerald-200 bg-emerald-50/60",
          iconActive: "bg-primary text-primary-foreground",
          iconIdle: "bg-emerald-100 text-emerald-900",
        }
      : {
          active: "border-primary bg-primary/5",
          idle: "border-amber-200 bg-amber-50/60",
          iconActive: "bg-primary text-primary-foreground",
          iconIdle: "bg-amber-100 text-amber-900",
        };

  return (
    <Card
      className={cn(
        "overflow-hidden border-2",
        isActive ? toneClass.active : toneClass.idle,
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-md",
                isActive ? toneClass.iconActive : toneClass.iconIdle,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {isActive ? <StatusBadge tone="default">Active</StatusBadge> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className={resolvedIssues ? "grid grid-cols-2 gap-8" : ""}>
          <IssueCountButton
            active={activeFilter === "all"}
            disabled={issues.length === 0 && activeFilter !== "all"}
            label={
              resolvedIssues
                ? "new issues"
                : `${formatNumber(metrics.totalIssues)} total issues loaded`
            }
            onClick={() => {
              if (activeFilter === "all") {
                onClearFilter();
              } else {
                onSelectFilter("all");
              }
            }}
            tone={resolvedIssues ? "red" : tone}
            value={issues.length}
            variant={resolvedIssues ? "primary" : "normal"}
          />
          {resolvedIssues ? (
            <IssueCountButton
              active={activeFilter === "resolved"}
              disabled={resolvedCount === 0 && activeFilter !== "resolved"}
              label="resolved issues"
              onClick={() => {
                if (activeFilter === "resolved") {
                  onClearFilter();
                } else {
                  onSelectFilter("resolved");
                }
              }}
              tone="emerald"
              value={resolvedCount}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function IssueSummaryCards({
  activeSevenDayFilter,
  activeYesterdayFilter,
  activeStatusFilter,
  historyComparison,
  issues,
  metrics,
  onClearSevenDayFilter,
  onClearYesterdayFilter,
  onSelectSevenDayFilter,
  onSelectStatusFilter,
  onSelectYesterdayFilter,
}: IssueSummaryCardsProps) {
  const yesterdayIssues = issues.filter((issue) => isIssueCreatedYesterday(issue));
  const sevenDayIssues = getIssuesByCaseIds(
    issues,
    historyComparison?.cases?.new_case_ids ?? [],
  );
  const sevenDayResolvedIssues = getIssuesByCaseIds(
    issues,
    historyComparison?.cases?.resolved_case_ids ?? [],
  );
  const statusData = buildStatusBreakdown(issues);
  const baselineDate = formatSnapshotDate(historyComparison?.cases?.baseline_date);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(360px,1.05fr)_minmax(0,1.55fr)]">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <NewIssuesCard
          activeFilter={activeYesterdayFilter}
          description="Created yesterday from the loaded case data."
          icon={CalendarClock}
          issues={yesterdayIssues}
          metrics={metrics}
          onClearFilter={onClearYesterdayFilter}
          onSelectFilter={onSelectYesterdayFilter}
          title="Yesterday's New Issues"
          tone="amber"
        />

        <NewIssuesCard
          activeFilter={activeSevenDayFilter}
          description={`Activity compared with ${baselineDate}.`}
          icon={CalendarDays}
          issues={sevenDayIssues}
          metrics={metrics}
          onClearFilter={onClearSevenDayFilter}
          onSelectFilter={onSelectSevenDayFilter}
          resolvedIssues={sevenDayResolvedIssues}
          title="7-Day Issue Activity"
          tone="emerald"
        />
      </div>

      <StatusBreakdownPanel
        activeStatusFilter={activeStatusFilter}
        data={statusData}
        onSelectStatusFilter={onSelectStatusFilter}
        openIssues={metrics.openIssues}
        total={metrics.totalIssues}
      />
    </section>
  );
}
