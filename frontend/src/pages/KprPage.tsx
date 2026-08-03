import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronDown,
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
type MetricScope = "pdm" | "equipment" | "test_item" | "issue";

const metricToneClasses: Record<
  MetricTone,
  { icon: string; value: string }
> = {
  blue: { icon: "text-blue-700", value: "text-blue-950" },
  green: { icon: "text-emerald-700", value: "text-emerald-700" },
  red: { icon: "text-red-700", value: "text-red-950" },
  teal: { icon: "text-teal-700", value: "text-teal-950" },
  slate: { icon: "text-slate-600", value: "text-slate-950" },
};

const metricScopeClasses: Record<MetricScope, { label: string; className: string }> = {
  pdm: {
    label: "PDM",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  equipment: {
    label: "Equipment",
    className: "border-teal-200 bg-teal-50 text-teal-700",
  },
  test_item: {
    label: "Test Item",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  issue: {
    label: "Issue",
    className: "border-red-200 bg-red-50 text-red-700",
  },
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

function MetricScopeBadge({ scope }: { scope: MetricScope }) {
  const config = metricScopeClasses[scope];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

function SectionHeading({
  description,
  icon,
  scope,
  title,
}: {
  description: string;
  icon: ReactNode;
  scope?: MetricScope;
  title: string;
}) {
  return (
    <div>
      <CardTitle className="flex items-center gap-2">
        {icon}
        {title}
        {scope ? <MetricScopeBadge scope={scope} /> : null}
      </CardTitle>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function MetricUnitLegend() {
  const units: Array<{ scope: MetricScope; description: string }> = [
    { scope: "pdm", description: "delivery group" },
    { scope: "equipment", description: "physical asset" },
    { scope: "test_item", description: "individual 3rd party check" },
    { scope: "issue", description: "Infralink case" },
  ];

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y bg-slate-50/70 px-5 py-3">
      <span className="text-xs font-semibold uppercase text-slate-700">Metric units</span>
      {units.map((unit) => (
        <div className="flex items-center gap-2" key={unit.scope}>
          <MetricScopeBadge scope={unit.scope} />
          <span className="text-xs text-muted-foreground">{unit.description}</span>
        </div>
      ))}
    </section>
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
      scope: "pdm" as const,
      value: `${formatNumber(summary.executive_summary.testing_started_pdms)} / ${formatNumber(
        summary.executive_summary.total_pdms,
      )}`,
      detail: "Current portfolio",
      icon: CirclePlay,
      tone: "blue" as const,
    },
    {
      label: "Fully Ready PDMs",
      scope: "pdm" as const,
      value: formatNumber(summary.executive_summary.fully_ready_pdms),
      detail: "No readiness blockers",
      icon: ShieldCheck,
      tone: "green" as const,
    },
    {
      label: "NETA Equipment Change",
      scope: "equipment" as const,
      value: signedNumber(netaNetChange),
      detail: `${formatNumber(
        summary.executive_summary.neta_complete_current,
      )} at ${shortDate(summary.period.end_date)} | ${formatNumber(
        summary.executive_summary.neta_completed_month,
      )} new / ${formatNumber(netaNoLongerComplete)} no longer marked`,
      icon: ClipboardCheck,
      tone: "teal" as const,
    },
    {
      label: "3rd Party Tests Passed",
      scope: "test_item" as const,
      value: signedNumber(summary.executive_summary.eps_passed_month),
      detail: `${formatNumber(
        summary.executive_summary.eps_passed_current,
      )} daily-report cumulative at ${shortDate(summary.period.end_date)}`,
      icon: Activity,
      tone: "blue" as const,
    },
    {
      label: "New Issues",
      scope: "issue" as const,
      value: signedNumber(summary.executive_summary.new_issues_month),
      detail: `${formatNumber(summary.executive_summary.current_open_issues)} current open`,
      icon: AlertTriangle,
      tone: "red" as const,
    },
    {
      label: "Resolved Issues",
      scope: "issue" as const,
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetricScopeBadge scope={metric.scope} />
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {metric.label}
                    </span>
                  </div>
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
  scope,
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
  scope: MetricScope;
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
            <MetricScopeBadge scope={scope} />
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
  const failureHistoryTotal = failureTypes.reduce(
    (total, item) => total + item.failure_history_total,
    0,
  );
  const currentFailed = failureTypes.reduce(
    (total, item) => total + item.current_failed,
    0,
  );
  const fixedAfterFailure = failureTypes.reduce(
    (total, item) => total + item.fixed_after_failure,
    0,
  );
  const safeHistoryTotal = Math.max(failureHistoryTotal, 1);
  const statusTotal = Math.max(currentFailed + fixedAfterFailure, 1);
  const currentFailedShare = (currentFailed / statusTotal) * 100;
  const fixedAfterFailureShare = (fixedAfterFailure / statusTotal) * 100;

  return (
    <div className="border-t px-5 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-950">
            3rd Party Test Failure Breakdown
          </h3>
          <MetricScopeBadge scope="test_item" />
        </div>
      </div>

      {failureTypes.length > 0 ? (
        <>
          <div className="mt-4 grid overflow-hidden rounded-md border sm:grid-cols-3">
            <div className="border-b border-red-200 bg-red-50/60 px-4 py-3 sm:border-b-0 sm:border-r">
              <div className="text-3xl font-semibold text-red-800">
                {formatNumber(currentFailed)}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase text-red-700">
                Current Failed
              </div>
              <div className="mt-1 text-xs text-red-700/80">
                {`${currentFailedShare.toFixed(1)}% of failure history`}
              </div>
            </div>
            <div className="border-b border-teal-200 bg-teal-50/60 px-4 py-3 sm:border-b-0 sm:border-r">
              <div className="text-3xl font-semibold text-teal-800">
                {formatNumber(fixedAfterFailure)}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase text-teal-700">
                Fixed After Failure
              </div>
              <div className="mt-1 text-xs text-teal-700/80">
                {`${fixedAfterFailureShare.toFixed(1)}% of failure history`}
              </div>
            </div>
            <div className="bg-slate-50 px-4 py-3">
              <div className="text-3xl font-semibold text-slate-950">
                {formatNumber(failureHistoryTotal)}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase text-slate-600">
                Failure History
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Failed plus fixed
              </div>
            </div>
          </div>

          <div
            aria-label={`${formatNumber(currentFailed)} current failed and ${formatNumber(fixedAfterFailure)} fixed after failure`}
            className="mt-3 flex h-7 overflow-hidden rounded-md"
            role="img"
          >
            {currentFailed > 0 ? (
              <div
                className="flex items-center justify-center bg-red-700 text-xs font-semibold text-white"
                style={{ width: `${currentFailedShare}%` }}
              >
                {currentFailedShare >= 12 ? `${currentFailedShare.toFixed(0)}%` : null}
              </div>
            ) : null}
            {fixedAfterFailure > 0 ? (
              <div
                className="flex items-center justify-center bg-teal-600 text-xs font-semibold text-white"
                style={{ width: `${fixedAfterFailureShare}%` }}
              >
                {fixedAfterFailureShare >= 12
                  ? `${fixedAfterFailureShare.toFixed(0)}%`
                  : null}
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="hidden grid-cols-[minmax(190px,260px)_80px_80px_1fr_70px] gap-3 border-b pb-2 text-[11px] font-semibold uppercase text-muted-foreground sm:grid">
              <span>Test Type</span>
              <span className="text-right">Failed</span>
              <span className="text-right">Fixed</span>
              <span>Share of Failure History</span>
              <span className="text-right">Share</span>
            </div>
            {failureTypes.map((item) => {
              const historyShare =
                (item.failure_history_total / safeHistoryTotal) * 100;
              const itemStatusTotal = Math.max(
                item.current_failed + item.fixed_after_failure,
                1,
              );
              const itemFailedShare =
                (item.current_failed / itemStatusTotal) * 100;
              const itemFixedShare =
                (item.fixed_after_failure / itemStatusTotal) * 100;
              return (
                <div
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(190px,260px)_80px_80px_1fr_70px]"
                  key={item.tracker_type}
                >
                  <div className="min-w-0 text-xs font-semibold text-slate-900">
                    {item.tracker_type}
                  </div>
                  <div className="text-right">
                    <strong className="text-lg font-semibold text-red-800">
                      {formatNumber(item.current_failed)}
                    </strong>
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                      Failed
                    </span>
                  </div>
                  <div className="text-right">
                    <strong className="text-lg font-semibold text-teal-700">
                      {formatNumber(item.fixed_after_failure)}
                    </strong>
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                      Fixed
                    </span>
                  </div>
                  <div
                    aria-label={`${item.tracker_type}: ${formatNumber(item.failure_history_total)} failure-history items, ${historyShare.toFixed(1)} percent of total`}
                    className="col-span-2 h-4 sm:col-span-1"
                    role="img"
                  >
                    <div
                      className="flex h-full min-w-[3px] overflow-hidden rounded-sm"
                      style={{ width: `${historyShare}%` }}
                    >
                      {item.current_failed > 0 ? (
                        <div
                          className="bg-red-700"
                          style={{ width: `${itemFailedShare}%` }}
                        />
                      ) : null}
                      {item.fixed_after_failure > 0 ? (
                        <div
                          className="bg-teal-600"
                          style={{ width: `${itemFixedShare}%` }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-slate-700">
                    {`${historyShare.toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No 3rd party test failure history is available.
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
  const hasLaterSnapshot = summary.current_snapshot.is_later_than_report;
  const latestNetaComplete = summary.current_snapshot.neta_complete_count;
  const latestNetaChange = latestNetaComplete - progress.neta.current_complete;

  return (
    <Card>
      <CardHeader className="border-b">
        <SectionHeading
          description="Compare movement within each panel; the totals use different units."
          icon={<TrendingUp className="h-5 w-5 text-blue-700" aria-hidden="true" />}
          title="Monthly Progress"
        />
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid xl:grid-cols-3">
          <TrendPanel
            accentColor="#0d9488"
            dataKey="neta_complete"
            detail={`Net change during ${summary.period.label}`}
            icon={<ClipboardCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />}
            metric={signedNumber(netaNetChange)}
            name="NETA Complete Equipment"
            scope="equipment"
            title="NETA Equipment Movement"
            trends={trends}
          >
            <div
              className={cn(
                "grid divide-x",
                hasLaterSnapshot ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <div className="pr-3">
                <div className="text-lg font-semibold text-slate-700">
                  {formatNumber(progress.neta.baseline_complete)}
                </div>
                <div className="text-[11px] text-muted-foreground">Month start</div>
              </div>
              <div className="px-3">
                <div className="text-lg font-semibold text-teal-800">
                  {formatNumber(progress.neta.current_complete)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {`Period end ${shortDate(summary.period.end_date)}`}
                </div>
              </div>
              {hasLaterSnapshot ? (
                <div className="pl-3">
                  <div className="text-lg font-semibold text-emerald-700">
                    {formatNumber(latestNetaComplete)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {`Latest ${shortDate(summary.current_snapshot.as_of_date)}`}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.min(progress.neta.completion_rate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 text-xs">
              <span className="text-muted-foreground">
                {`${progress.neta.completion_rate.toFixed(1)}% complete at period end`}
              </span>
              {hasLaterSnapshot ? (
                <strong className="font-semibold text-emerald-700">
                  {`${signedNumber(latestNetaChange)} since period end`}
                </strong>
              ) : null}
            </div>
            <div className="mt-2 text-right text-[11px] text-muted-foreground">
              {`${formatNumber(progress.neta.completed_month)} newly complete | ${formatNumber(
                netaNoLongerComplete,
              )} no longer marked complete`}
            </div>
          </TrendPanel>

          <TrendPanel
            accentColor="#2563eb"
            dataKey="eps_passed"
            detail={`Passed during ${summary.period.label}`}
            icon={<Activity className="h-4 w-4 text-blue-700" aria-hidden="true" />}
            metric={signedNumber(progress.eps.daily_passed_month)}
            name="Daily Report Passed Test Items"
            scope="test_item"
            title="3rd Party Test Activity"
            trends={trends}
          >
            <div className="flex items-center justify-between gap-4 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2">
              <div>
                <div className="text-[11px] font-semibold uppercase text-blue-800">
                  Daily Report Cumulative
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {`${formatNumber(progress.eps.daily_passed_baseline)} at month start`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-blue-900">
                  {formatNumber(progress.eps.daily_passed_current)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {`Period end ${shortDate(summary.period.end_date)}`}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Source: Daily Test Reports
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
            scope="issue"
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

function LifecycleStage({
  stage,
}: {
  stage: KprLifecycleStage;
}) {
  const change = stage.month_change;
  const changeLabel =
    change > 0
      ? `${formatNumber(change)} more than month start`
      : change < 0
        ? `${formatNumber(Math.abs(change))} fewer than month start`
        : "No change from month start";

  return (
    <div
      className="relative min-w-0 rounded-md border px-4 py-3"
      style={{
        backgroundColor: `${stage.color}0D`,
        borderColor: `${stage.color}55`,
      }}
    >
      <div className="flex min-h-10 items-start gap-2">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
        <span className="text-sm font-semibold leading-5 text-slate-950">{stage.label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold leading-none text-slate-950">
            {formatNumber(stage.current_count)}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase text-muted-foreground">
            Current
          </div>
        </div>
        <div className="text-right" title={changeLabel}>
          <div
            className="inline-flex items-center gap-1 text-base font-semibold"
            style={{ color: stage.color }}
          >
            {change > 0 ? (
              <ArrowUpRight
                className="h-4 w-4 animate-trend-rise"
                aria-label={changeLabel}
              />
            ) : change < 0 ? (
              <ArrowDownRight
                className="h-4 w-4 animate-trend-fall"
                aria-label={changeLabel}
              />
            ) : (
              <span aria-label={changeLabel}>-</span>
            )}
            {change !== 0 ? formatNumber(Math.abs(change)) : null}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {`from ${formatNumber(stage.baseline_count)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function EquipmentLifecycle({ summary }: { summary: KprSummary }) {
  const lifecycle = summary.equipment_lifecycle;
  const visibleTransitions = lifecycle.transitions.slice(0, 10);
  const workflowStages = lifecycle.stages.filter((stage) => stage.key !== "unmapped");
  const mappedEquipmentCount = workflowStages.reduce(
    (total, stage) => total + stage.current_count,
    0,
  );
  const unmappedStage = lifecycle.stages.find((stage) => stage.key === "unmapped");
  const unmappedCount = unmappedStage?.current_count ?? 0;
  const baselineDate = displayDate(
    summary.period.system_baseline_date ?? summary.period.start_date,
  );
  const currentDate = displayDate(summary.current_snapshot.as_of_date);

  return (
    <Card>
      <CardHeader className="gap-3 border-b md:flex-row md:items-start md:justify-between">
        <SectionHeading
          description={`${baselineDate} to ${currentDate} | ${formatNumber(lifecycle.total_equipment)} equipment`}
          icon={<ArrowRight className="h-5 w-5 text-emerald-700" aria-hidden="true" />}
          scope="equipment"
          title="Equipment Lifecycle"
        />
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">{`${formatNumber(lifecycle.advanced_count)} forward`}</StatusBadge>
          <StatusBadge tone={lifecycle.regressed_count > 0 ? "danger" : "muted"}>
            {`${formatNumber(lifecycle.regressed_count)} backward`}
          </StatusBadge>
          <StatusBadge tone={unmappedCount > 0 ? "warning" : "muted"}>
            {`${formatNumber(unmappedCount)} unmapped`}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="space-y-3">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {workflowStages.map((stage) =>
              stage.current_count > 0 && mappedEquipmentCount > 0 ? (
                <div
                  key={stage.key}
                  style={{
                    backgroundColor: stage.color,
                    width: `${(stage.current_count / mappedEquipmentCount) * 100}%`,
                  }}
                  title={`${stage.label}: ${formatNumber(stage.current_count)}`}
                />
              ) : null,
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {workflowStages.map((stage) => (
              <LifecycleStage key={stage.key} stage={stage} />
            ))}
          </div>
        </div>

        <details className="group overflow-hidden rounded-md border bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-950">Movement details</span>
              <span className="text-xs text-muted-foreground">
                {`${formatNumber(lifecycle.transitions.length)} transitions | ${formatNumber(unmappedCount)} unmapped`}
              </span>
            </div>
            <ChevronDown
              className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-5 border-t bg-white p-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="overflow-hidden rounded-md border">
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
                  No stage changes.
                </div>
              )}
            </div>
            <div
              className={cn(
                "rounded-md border p-4",
                unmappedCount > 0 ? "border-amber-300 bg-amber-50/60" : "bg-slate-50",
              )}
            >
              <div className="flex items-baseline gap-2">
                <strong className="text-2xl text-slate-950">{formatNumber(unmappedCount)}</strong>
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  Unmapped
                </span>
              </div>
              {unmappedStage ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {`${formatNumber(unmappedStage.baseline_count)} to ${formatNumber(unmappedStage.current_count)}`}
                </div>
              ) : null}
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
        </details>
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
          scope="issue"
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
      label: "NETA Complete Equipment",
      value: snapshot.neta_complete_count,
      icon: ClipboardCheck,
      color: "text-teal-700",
    },
    {
      label: "Daily Report Passed Items",
      value: snapshot.eps_passed_count,
      icon: Activity,
      color: "text-blue-700",
    },
    {
      label: "Failed Test Items",
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
      <MetricUnitLegend />
      <ExecutiveSummary summary={summary} />
      <MonthlyProgress summary={summary} />
      <EquipmentLifecycle summary={summary} />
      <IssuePerformance summary={summary} />
    </div>
  );
}
