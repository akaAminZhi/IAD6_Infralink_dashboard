import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CirclePlay,
  ClipboardCheck,
  Flag,
  Maximize2,
  Minimize2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import type {
  DashboardData,
  KprLifecycleStage,
  KprSummary,
  KprTrendPoint,
} from "../types/data";
import { cn } from "../utils/cn";
import { formatDateTime, formatNumber } from "../utils/formatters";

interface KprPageProps {
  data: DashboardData;
}

type MetricTone = "blue" | "green" | "red" | "teal" | "slate";

const metricToneClasses: Record<
  MetricTone,
  { icon: string; value: string }
> = {
  blue: { icon: "text-blue-700", value: "text-blue-950" },
  green: { icon: "text-emerald-700", value: "text-emerald-950" },
  red: { icon: "text-red-700", value: "text-red-950" },
  teal: { icon: "text-teal-700", value: "text-teal-950" },
  slate: { icon: "text-slate-600", value: "text-slate-950" },
};

function signedNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function shortDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function displayDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(parsed);
}

function SectionHeading({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div>
      <CardTitle className="flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ExecutiveSummary({ summary }: { summary: KprSummary }) {
  const netaNetChange =
    summary.executive_summary.neta_net_change_month ??
    summary.executive_summary.neta_complete_current -
      summary.executive_summary.neta_complete_baseline;
  const netaNoLongerComplete =
    summary.executive_summary.neta_no_longer_complete_month ??
    Math.max(
      0,
      summary.executive_summary.neta_completed_month - netaNetChange,
    );
  const metrics = [
    {
      label: "PDM Testing Started",
      value: `${formatNumber(summary.executive_summary.testing_started_pdms)} / ${formatNumber(
        summary.executive_summary.total_pdms,
      )}`,
      detail: "Current portfolio",
      icon: CirclePlay,
      tone: "blue" as const,
    },
    {
      label: "Fully Ready PDMs",
      value: formatNumber(summary.executive_summary.fully_ready_pdms),
      detail: "No readiness blockers",
      icon: ShieldCheck,
      tone: "green" as const,
    },
    {
      label: "NETA Net Change",
      value: signedNumber(netaNetChange),
      detail: `${formatNumber(
        summary.executive_summary.neta_complete_current,
      )} cumulative · ${formatNumber(
        summary.executive_summary.neta_completed_month,
      )} new / ${formatNumber(netaNoLongerComplete)} no longer marked`,
      icon: ClipboardCheck,
      tone: "teal" as const,
    },
    {
      label: "EPS Passed",
      value: signedNumber(summary.executive_summary.eps_passed_month),
      detail: `${formatNumber(summary.executive_summary.eps_passed_current)} cumulative`,
      icon: Activity,
      tone: "blue" as const,
    },
    {
      label: "New Issues",
      value: signedNumber(summary.executive_summary.new_issues_month),
      detail: `${formatNumber(summary.executive_summary.current_open_issues)} current open`,
      icon: AlertTriangle,
      tone: "red" as const,
    },
    {
      label: "Resolved Issues",
      value: formatNumber(summary.executive_summary.resolved_issues_month),
      detail: "Closed during period",
      icon: CheckCheck,
      tone: "green" as const,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-slate-50/60">
        <SectionHeading
          description="Reporting-period delivery, testing, and issue performance."
          icon={<Flag className="h-5 w-5 text-slate-700" aria-hidden="true" />}
          title="Executive Summary"
        />
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid sm:grid-cols-2 xl:grid-cols-6">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const tone = metricToneClasses[metric.tone];
            return (
              <div
                className={cn(
                  "min-h-28 px-5 py-4",
                  index < metrics.length - 1 && "border-b xl:border-b-0 xl:border-r",
                  index % 2 === 0 && "sm:border-r xl:border-r",
                )}
                key={metric.label}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {metric.label}
                  </span>
                  <Icon className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
                </div>
                <div className={`mt-2 text-2xl font-semibold ${tone.value}`}>
                  {metric.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{
    color?: string;
    dataKey?: string;
    name?: string;
    value?: number;
  }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-md border bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold text-slate-950">{shortDate(label ?? "")}</div>
      <div className="grid gap-1.5">
        {payload.map((item) => (
          <div className="flex min-w-40 items-center justify-between gap-5" key={item.dataKey}>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
            <strong className="text-slate-950">{formatNumber(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

type TrendDataKey = "neta_complete" | "eps_passed" | "issue_backlog";

function TrendPanel({
  accentColor,
  children,
  dataKey,
  detail,
  icon,
  metric,
  name,
  title,
  trends,
}: {
  accentColor: string;
  children: ReactNode;
  dataKey: TrendDataKey;
  detail: string;
  icon: ReactNode;
  metric: string;
  name: string;
  title: string;
  trends: KprTrendPoint[];
}) {
  return (
    <section className="min-w-0 p-5 xl:border-r xl:last:border-r-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            {icon}
            {title}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{metric}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      </div>

      <div className="mt-4 h-40 min-w-0">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={trends} margin={{ bottom: 0, left: -10, right: 8, top: 8 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={30}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickFormatter={shortDate}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              domain={[0, "auto"]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ProgressTooltip />} />
            <Line
              dataKey={dataKey}
              dot={false}
              name={name}
              stroke={accentColor}
              strokeWidth={2.5}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 border-t pt-4">{children}</div>
    </section>
  );
}

function FailureTypeBreakdown({ summary }: { summary: KprSummary }) {
  const failureTypes = summary.eps_failure_types;
  const maxTotal = Math.max(
    ...failureTypes.map((item) => item.failure_history_total),
    1,
  );
  const currentFailed = failureTypes.reduce(
    (total, item) => total + item.current_failed,
    0,
  );
  const fixedAfterFailure = failureTypes.reduce(
    (total, item) => total + item.fixed_after_failure,
    0,
  );

  return (
    <div className="border-t px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            EPS Failure Type Breakdown
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {`Current failure history by Tracker Type as of ${displayDate(
              summary.current_snapshot.as_of_date,
            )}. Fixed items remain visible.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-700" />
            {`${formatNumber(currentFailed)} current failed`}
          </span>
          <span className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-teal-600" />
            {`${formatNumber(fixedAfterFailure)} fixed after failure`}
          </span>
        </div>
      </div>

      {failureTypes.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {failureTypes.map((item) => {
            const failedWidth = (item.current_failed / maxTotal) * 100;
            const fixedWidth = (item.fixed_after_failure / maxTotal) * 100;
            return (
              <div
                className="grid items-center gap-3 sm:grid-cols-[minmax(190px,260px)_1fr_150px]"
                key={item.tracker_type}
              >
                <div className="truncate text-xs font-medium text-slate-800">
                  {item.tracker_type}
                </div>
                <div className="relative h-3 overflow-hidden rounded-sm bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 bg-red-700"
                    style={{ width: `${failedWidth}%` }}
                  />
                  <div
                    className="absolute inset-y-0 bg-teal-600"
                    style={{
                      left: `${failedWidth}%`,
                      width: `${fixedWidth}%`,
                    }}
                  />
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  <strong className="font-semibold text-red-800">
                    {formatNumber(item.current_failed)}
                  </strong>
                  <span>{" failed · "}</span>
                  <strong className="font-semibold text-teal-700">
                    {formatNumber(item.fixed_after_failure)}
                  </strong>
                  <span>{" fixed"}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No EPS failure history is available.
        </div>
      )}
    </div>
  );
}

function MonthlyProgress({ summary }: { summary: KprSummary }) {
  const trends = summary.monthly_trends;
  const progress = summary.monthly_progress;
  const netaNetChange =
    progress.neta.net_change_month ??
    progress.neta.current_complete - progress.neta.baseline_complete;
  const netaNoLongerComplete =
    progress.neta.no_longer_complete_month ??
    Math.max(0, progress.neta.completed_month - netaNetChange);

  return (
    <Card>
      <CardHeader className="border-b">
        <SectionHeading
          description="Independent equipment, test-item, and issue trends for accurate scale comparison."
          icon={<TrendingUp className="h-5 w-5 text-blue-700" aria-hidden="true" />}
          title="Monthly Progress"
        />
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid xl:grid-cols-3">
          <TrendPanel
            accentColor="#0d9488"
            dataKey="neta_complete"
            detail={`${progress.neta.completion_rate.toFixed(1)}% of linked equipment complete`}
            icon={<ClipboardCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />}
            metric={`${formatNumber(progress.neta.current_complete)} / ${formatNumber(
              progress.neta.total_equipment,
            )}`}
            name="NETA Complete Equipment"
            title="NETA Equipment Progress"
            trends={trends}
          >
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.min(progress.neta.completion_rate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 text-xs">
              <span className="text-muted-foreground">
                {`${formatNumber(progress.neta.baseline_complete)} at month start`}
              </span>
              <strong className="font-semibold text-teal-700">
                {`${signedNumber(netaNetChange)} net complete`}
              </strong>
            </div>
            <div className="mt-2 text-right text-[11px] text-muted-foreground">
              {`${formatNumber(progress.neta.completed_month)} newly complete · ${formatNumber(
                netaNoLongerComplete,
              )} no longer marked complete`}
            </div>
          </TrendPanel>

          <TrendPanel
            accentColor="#2563eb"
            dataKey="eps_passed"
            detail={`Daily report cumulative · ${signedNumber(
              progress.eps.daily_passed_month,
            )} this month`}
            icon={<Activity className="h-4 w-4 text-blue-700" aria-hidden="true" />}
            metric={formatNumber(progress.eps.daily_passed_current)}
            name="EPS Passed Records"
            title="EPS Test Execution"
            trends={trends}
          >
            <div className="grid grid-cols-3 divide-x">
              <div className="pr-3">
                <div className="text-lg font-semibold text-blue-800">
                  {formatNumber(progress.eps.tracker_passed_or_fixed)}
                </div>
                <div className="text-[11px] text-muted-foreground">Passed / fixed</div>
              </div>
              <div className="px-3">
                <div className="text-lg font-semibold text-red-800">
                  {formatNumber(progress.eps.tracker_current_failed)}
                </div>
                <div className="text-[11px] text-muted-foreground">Current failed</div>
              </div>
              <div className="pl-3">
                <div className="text-lg font-semibold text-slate-700">
                  {formatNumber(progress.eps.tracker_not_tested)}
                </div>
                <div className="text-[11px] text-muted-foreground">Not tested</div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              {`${formatNumber(
                progress.eps.tracker_total_test_items,
              )} current Tracker test items as of ${displayDate(
                progress.eps.tracker_as_of_date,
              )} · ${formatNumber(
                progress.eps.tracker_fixed_after_failure,
              )} fixed after failure`}
            </div>
          </TrendPanel>

          <TrendPanel
            accentColor="#dc2626"
            dataKey="issue_backlog"
            detail={`${signedNumber(
              progress.issues.current_open - progress.issues.month_start_open,
            )} net backlog change`}
            icon={<AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" />}
            metric={formatNumber(progress.issues.current_open)}
            name="Open Issue Backlog"
            title="Issue Backlog"
            trends={trends}
          >
            <div className="grid grid-cols-3 divide-x">
              <div className="pr-3">
                <div className="text-lg font-semibold text-slate-800">
                  {formatNumber(progress.issues.month_start_open)}
                </div>
                <div className="text-[11px] text-muted-foreground">Month start</div>
              </div>
              <div className="px-3">
                <div className="text-lg font-semibold text-red-800">
                  {formatNumber(progress.issues.new_issues)}
                </div>
                <div className="text-[11px] text-muted-foreground">New issues</div>
              </div>
              <div className="pl-3">
                <div className="text-lg font-semibold text-emerald-700">
                  {formatNumber(progress.issues.resolved_issues)}
                </div>
                <div className="text-[11px] text-muted-foreground">Resolved</div>
              </div>
            </div>
          </TrendPanel>
        </div>
        <FailureTypeBreakdown summary={summary} />
      </CardContent>
    </Card>
  );
}

function PdmPipeline({ summary }: { summary: KprSummary }) {
  const stages = summary.pdm_pipeline.stages;
  const total = Math.max(summary.pdm_pipeline.total_pdms, 1);

  return (
    <Card>
      <CardHeader className="border-b">
        <SectionHeading
          description="Current PDM position from execution start through readiness, with risk separated."
          icon={<CirclePlay className="h-5 w-5 text-blue-700" aria-hidden="true" />}
          title="PDM Delivery Pipeline"
        />
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
          {stages.map((stage) =>
            stage.count > 0 ? (
              <div
                key={stage.key}
                style={{
                  backgroundColor: stage.color,
                  width: `${(stage.count / total) * 100}%`,
                }}
                title={`${stage.label}: ${stage.count}`}
              />
            ) : null,
          )}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage) => (
            <div className="border-l-2 pl-4" key={stage.key} style={{ borderColor: stage.color }}>
              <div className="text-xs font-medium text-muted-foreground">{stage.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="text-2xl text-slate-950">{formatNumber(stage.count)}</strong>
                <span className="text-xs text-muted-foreground">
                  {((stage.count / total) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LifecycleStage({ stage }: { stage: KprLifecycleStage }) {
  return (
    <div className="min-w-0 flex-1 border-y border-l bg-white px-3 py-3 first:rounded-l-md">
      <div className="h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
      <div className="mt-3 min-h-10 text-xs font-semibold text-slate-800">{stage.label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">
        {formatNumber(stage.current_count)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {signedNumber(stage.month_change)} net change
      </div>
    </div>
  );
}

function EquipmentLifecycle({ summary }: { summary: KprSummary }) {
  const lifecycle = summary.equipment_lifecycle;
  const visibleTransitions = lifecycle.transitions.slice(0, 7);
  const unmappedCount =
    lifecycle.stages.find((stage) => stage.key === "unmapped")?.current_count ?? 0;

  return (
    <Card>
      <CardHeader className="gap-3 border-b md:flex-row md:items-start md:justify-between">
        <SectionHeading
          description="Observed equipment stage movement from the month-start baseline to the current export."
          icon={<ArrowRight className="h-5 w-5 text-emerald-700" aria-hidden="true" />}
          title="Equipment Lifecycle Movement"
        />
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">{`${formatNumber(lifecycle.advanced_count)} advanced`}</StatusBadge>
          <StatusBadge tone={lifecycle.regressed_count > 0 ? "danger" : "muted"}>
            {`${formatNumber(lifecycle.regressed_count)} regressed`}
          </StatusBadge>
          <StatusBadge tone={unmappedCount > 0 ? "warning" : "muted"}>
            {`${formatNumber(unmappedCount)} unmapped`}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1180px] items-stretch">
            {lifecycle.stages.map((stage, index) => (
              <div className="flex min-w-0 flex-1 items-stretch" key={stage.key}>
                <LifecycleStage stage={stage} />
                {index < lifecycle.stages.length - 1 ? (
                  <div className="flex w-6 shrink-0 items-center justify-center border-y bg-slate-50">
                    <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Observed Stage Movement</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Month-start to current comparison; intermediate stages may occur between exports.
            </p>
            <div className="mt-3 overflow-hidden rounded-md border">
              {visibleTransitions.length > 0 ? (
                visibleTransitions.map((transition, index) => (
                  <div
                    className={cn(
                      "grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm",
                      index < visibleTransitions.length - 1 && "border-b",
                    )}
                    key={`${transition.from_key}-${transition.to_key}`}
                  >
                    <span className="text-slate-700">{transition.from_label}</span>
                    <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span className="font-medium text-slate-950">{transition.to_label}</span>
                    <strong
                      className={
                        transition.direction === "regressed"
                          ? "text-red-700"
                          : "text-emerald-700"
                      }
                    >
                      {formatNumber(transition.count)}
                    </strong>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No stage changes observed in this period.
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">Lifecycle Data Quality</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              New or blank statuses stay visible until mapped in the lifecycle configuration.
            </p>
            <div
              className={cn(
                "mt-3 rounded-md border p-4",
                unmappedCount > 0 ? "border-amber-300 bg-amber-50/60" : "bg-slate-50",
              )}
            >
              <div className="text-2xl font-semibold text-slate-950">
                {formatNumber(unmappedCount)}
              </div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Unmapped equipment
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {lifecycle.unmapped_statuses.length > 0 ? (
                  lifecycle.unmapped_statuses.map((item) => (
                    <StatusBadge key={item.status} tone="warning">
                      {`${item.status}: ${formatNumber(item.count)}`}
                    </StatusBadge>
                  ))
                ) : (
                  <StatusBadge tone="success">All statuses mapped</StatusBadge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BacklogTerm({
  label,
  operator,
  tone,
  value,
}: {
  label: string;
  operator?: string;
  tone: MetricTone;
  value: number;
}) {
  return (
    <>
      {operator ? (
        <div className="hidden items-center justify-center text-2xl font-light text-slate-400 sm:flex">
          {operator}
        </div>
      ) : null}
      <div className="min-w-0 px-3 py-3 text-center">
        <div className={`text-2xl font-semibold ${metricToneClasses[tone].value}`}>
          {formatNumber(value)}
        </div>
        <div className="mt-1 text-xs font-medium uppercase text-muted-foreground">{label}</div>
      </div>
    </>
  );
}

function IssuePerformance({ summary }: { summary: KprSummary }) {
  const issues = summary.issue_performance;
  const exceptionMetrics = [
    { label: "Overdue Open", value: issues.overdue_open, tone: "red" as const },
    { label: "Urgent / High", value: issues.urgent_high_open, tone: "red" as const },
    { label: "Open Over 30 Days", value: issues.open_over_30_days, tone: "red" as const },
    {
      label: "Average Open Age",
      value:
        issues.average_open_age_days === null ||
        issues.average_open_age_days === undefined
          ? "-"
          : `${issues.average_open_age_days.toFixed(1)}d`,
      tone: "slate" as const,
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b">
        <SectionHeading
          description="Backlog movement and aging risk during the reporting month."
          icon={<AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />}
          title="Issue Performance"
        />
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] xl:items-center">
          <div className="rounded-md border bg-slate-50/60">
            <div className="grid sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
              <BacklogTerm label="Month Start" tone="slate" value={issues.month_start_open} />
              <BacklogTerm label="New" operator="+" tone="red" value={issues.new_issues} />
              <BacklogTerm
                label="Resolved"
                operator="-"
                tone="green"
                value={issues.resolved_issues}
              />
              <BacklogTerm
                label="Current Open"
                operator="="
                tone="red"
                value={issues.current_open}
              />
            </div>
            {issues.balance_adjustment !== 0 ? (
              <div className="border-t px-4 py-2 text-xs text-amber-800">
                {`${signedNumber(issues.balance_adjustment)} status/reconciliation adjustment`}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            {exceptionMetrics.map((metric) => (
              <div className="border-l pl-4" key={metric.label}>
                <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
                <div className={`mt-1 text-xl font-semibold ${metricToneClasses[metric.tone].value}`}>
                  {typeof metric.value === "number" ? formatNumber(metric.value) : metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentSnapshot({ summary }: { summary: KprSummary }) {
  const snapshot = summary.current_snapshot;
  const metrics = [
    {
      label: "NETA Complete",
      value: snapshot.neta_complete_count,
      icon: ClipboardCheck,
      color: "text-teal-700",
    },
    {
      label: "EPS Passed",
      value: snapshot.eps_passed_count,
      icon: Activity,
      color: "text-blue-700",
    },
    {
      label: "Current Failed",
      value: snapshot.eps_current_failed,
      icon: AlertTriangle,
      color: "text-red-700",
    },
    {
      label: "Open Issues",
      value: snapshot.open_issue_count,
      icon: Flag,
      color: "text-red-700",
    },
  ];

  return (
    <section className="flex flex-wrap items-center justify-between gap-5 border-y bg-slate-50/70 px-5 py-3">
      <div>
        <div className="text-sm font-semibold text-slate-950">Current Snapshot</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {`Latest operational status as of ${displayDate(
            snapshot.as_of_date,
          )}; monthly performance remains locked to ${summary.period.label}.`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div className="flex items-center gap-2.5" key={metric.label}>
              <Icon className={`h-4 w-4 ${metric.color}`} aria-hidden="true" />
              <div>
                <div className="text-lg font-semibold leading-none text-slate-950">
                  {formatNumber(metric.value)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {metric.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KprPage({ data }: KprPageProps) {
  const [isPresenting, setIsPresenting] = useState(false);
  const summary = data.kprSummary;

  if (!summary) {
    return (
      <EmptyState
        description="Run python scripts/etl/run_etl.py to generate the monthly KPR dataset."
        title="Monthly KPR data is not available."
      />
    );
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1600px] flex-col gap-5",
        isPresenting &&
          "fixed inset-0 z-50 max-w-none overflow-y-auto bg-background px-8 py-6 [&>*]:shrink-0",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">Monthly KPR</h1>
            <StatusBadge tone="default">{summary.period.label}</StatusBadge>
            {summary.period.is_month_to_date ? (
              <StatusBadge tone="teal">Month to date</StatusBadge>
            ) : (
              <StatusBadge tone="default">Last complete month</StatusBadge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {`${displayDate(summary.period.start_date)} - ${displayDate(
                summary.period.end_date,
              )}`}
            </span>
            <span>{`Baseline ${displayDate(summary.period.system_baseline_date)}`}</span>
            {summary.period.target_end_date &&
            summary.period.target_end_date !== summary.period.end_date ? (
              <span>{`Latest reporting data through ${displayDate(
                summary.period.end_date,
              )}`}</span>
            ) : null}
            <span>{`Updated ${formatDateTime(summary.generated_at)}`}</span>
          </div>
        </div>
        <Button
          className="gap-2"
          onClick={() => setIsPresenting((current) => !current)}
          type="button"
          variant="outline"
        >
          {isPresenting ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
          {isPresenting ? "Exit presentation" : "Presentation mode"}
        </Button>
      </header>

      {summary.current_snapshot.is_later_than_report ? (
        <CurrentSnapshot summary={summary} />
      ) : null}
      <ExecutiveSummary summary={summary} />
      <MonthlyProgress summary={summary} />
      <PdmPipeline summary={summary} />
      <EquipmentLifecycle summary={summary} />
      <IssuePerformance summary={summary} />
    </div>
  );
}
