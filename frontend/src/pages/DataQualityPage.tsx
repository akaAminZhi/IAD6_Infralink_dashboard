import { AlertTriangle, CheckCircle2, CircleAlert, ClipboardCheck, FileWarning } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import type { CaseIssue, DashboardData, EpsTestItemRecord } from "../types/data";
import { cn } from "../utils/cn";
import { formatNumber } from "../utils/formatters";
import { isOpenIssue } from "../utils/issueUtils";

interface DataQualityPageProps {
  data: DashboardData;
}

interface FailedIssueGroup {
  equipmentKey: string;
  pdmNames: string[];
  issues: CaseIssue[];
  openIssues: CaseIssue[];
  resolvedIssues: CaseIssue[];
  failedItems: EpsTestItemRecord[];
  issueCount: number;
  failedItemCount: number;
  delta: number;
}

function normalizeEquipmentKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return normalized.startsWith("IAD06-") ? normalized.slice("IAD06-".length) : normalized;
}

function issueEquipmentKey(issue: CaseIssue): string {
  return normalizeEquipmentKey(issue.equipment_id || issue.system_element_raw);
}

function failedItemEquipmentKey(item: EpsTestItemRecord): string {
  return normalizeEquipmentKey(
    item.module_equipment_key ||
      item.module_equipment ||
      item.matched_equipment_id ||
      item.equipment_key ||
      item.equipment_name,
  );
}

function isFailedTestItem(item: EpsTestItemRecord): boolean {
  return item.item_status === "Failed" || item.item_status === "Failed - Not In Tracker";
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function buildFailedIssueGroups(cases: CaseIssue[], epsTestItems: EpsTestItemRecord[]): FailedIssueGroup[] {
  const openIssuesByEquipment = new Map<string, CaseIssue[]>();
  const resolvedIssuesByEquipment = new Map<string, CaseIssue[]>();
  const failedItemsByEquipment = new Map<string, EpsTestItemRecord[]>();

  for (const issue of cases) {
    const equipmentKey = issueEquipmentKey(issue);
    if (!equipmentKey) {
      continue;
    }

    const map = isOpenIssue(issue) ? openIssuesByEquipment : resolvedIssuesByEquipment;
    const records = map.get(equipmentKey) ?? [];
    records.push(issue);
    map.set(equipmentKey, records);
  }

  for (const item of epsTestItems) {
    if (!isFailedTestItem(item)) {
      continue;
    }

    const equipmentKey = failedItemEquipmentKey(item);
    if (!equipmentKey) {
      continue;
    }

    const records = failedItemsByEquipment.get(equipmentKey) ?? [];
    records.push(item);
    failedItemsByEquipment.set(equipmentKey, records);
  }

  const equipmentKeys = Array.from(
    new Set([
      ...openIssuesByEquipment.keys(),
      ...resolvedIssuesByEquipment.keys(),
      ...failedItemsByEquipment.keys(),
    ]),
  );

  return equipmentKeys
    .map((equipmentKey) => {
      const openIssues = openIssuesByEquipment.get(equipmentKey) ?? [];
      const resolvedIssues = resolvedIssuesByEquipment.get(equipmentKey) ?? [];
      const issues = [...openIssues, ...resolvedIssues];
      const failedItems = failedItemsByEquipment.get(equipmentKey) ?? [];
      const pdmNames = uniqueSorted(failedItems.map((item) => item.pdm_name));
      const issueCount = issues.length;
      const failedItemCount = failedItems.length;

      return {
        equipmentKey,
        pdmNames,
        issues,
        openIssues,
        resolvedIssues,
        failedItems,
        issueCount,
        failedItemCount,
        delta: failedItemCount - issueCount,
      };
    })
    .sort((a, b) => {
      const absDelta = Math.abs(b.delta) - Math.abs(a.delta);
      if (absDelta !== 0) {
        return absDelta;
      }
      return a.equipmentKey.localeCompare(b.equipmentKey);
    });
}

function SummaryMetricCard({
  className,
  description,
  icon: Icon,
  label,
  value,
}: {
  className: string;
  description: string;
  icon: typeof CircleAlert;
  label: string;
  value: number;
}) {
  return (
    <Card className={cn("border", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-normal">{formatNumber(value)}</div>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}

function IssueList({ issues }: { issues: CaseIssue[] }) {
  if (issues.length === 0) {
    return <div className="text-sm text-muted-foreground">No Infralink issues.</div>;
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div className="rounded-md border bg-background p-2" key={issue.case_id ?? issue.summary}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{issue.case_id ?? "No case ID"}</span>
            <StatusBadge tone="muted">{issue.status ?? "Unknown"}</StatusBadge>
            {issue.priority ? <StatusBadge tone="warning">{issue.priority}</StatusBadge> : null}
          </div>
          <div className="mt-1 text-muted-foreground">{issue.summary ?? "--"}</div>
        </div>
      ))}
    </div>
  );
}

function FailedItemList({ items }: { items: EpsTestItemRecord[] }) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">No EPS failed test items.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          className="rounded-md border bg-background p-2"
          key={`${item.equipment_key ?? item.equipment_name}-${item.tracker_row ?? index}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.equipment_name ?? item.equipment_key ?? "--"}</span>
            <StatusBadge tone="danger">{item.item_status ?? "Failed"}</StatusBadge>
            {item.tracker_type ? <StatusBadge tone="muted">{item.tracker_type}</StatusBadge> : null}
          </div>
          <div className="mt-1 text-muted-foreground">
            {item.comments || item.reason || "No EPS tracker comment."}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DataQualityPage({ data }: DataQualityPageProps) {
  const comparison = useMemo(() => {
    const groups = buildFailedIssueGroups(data.cases, data.epsTestItems);
    const mismatchGroups = groups.filter((group) => group.delta !== 0);
    const epsOnlyGroups = groups.filter((group) => group.failedItemCount > 0 && group.issueCount === 0);
    const issueOnlyGroups = groups.filter((group) => group.issueCount > 0 && group.failedItemCount === 0);
    const openIssueCount = data.cases.filter(isOpenIssue).length;
    const resolvedIssueCount = data.cases.length - openIssueCount;
    const failedItemCount = data.epsTestItems.filter(isFailedTestItem).length;

    return {
      groups,
      mismatchGroups,
      epsOnlyGroups,
      issueOnlyGroups,
      openIssueCount,
      resolvedIssueCount,
      failedItemCount,
    };
  }, [data.cases, data.epsTestItems]);

  const hasNoData = data.cases.length === 0 && data.epsTestItems.length === 0;

  if (hasNoData) {
    return (
      <EmptyState
        title="No data quality inputs loaded."
        description="Issue and EPS execution detail data could not be loaded."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Data Quality</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reconcile Infralink issues against EPS failed test items by equipment/module.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryMetricCard
          className="border-red-300 bg-red-50/80 text-red-950"
          description="Open or acknowledged Infralink cases."
          icon={CircleAlert}
          label="Open Issues"
          value={comparison.openIssueCount}
        />
        <SummaryMetricCard
          className="border-slate-200 bg-slate-50/80 text-slate-950"
          description="Open + resolved; this is used for EPS reconciliation."
          icon={FileWarning}
          label="Total Issues"
          value={data.cases.length}
        />
        <SummaryMetricCard
          className="border-amber-200 bg-amber-50/80 text-amber-950"
          description="Failed and failed-not-in-tracker EPS test items."
          icon={ClipboardCheck}
          label="EPS Failed Tests"
          value={comparison.failedItemCount}
        />
        <SummaryMetricCard
          className={
            comparison.epsOnlyGroups.length > 0
              ? "border-red-300 bg-red-50/80 text-red-950"
              : "border-emerald-200 bg-emerald-50/70 text-emerald-950"
          }
          description="Failed tests with no Infralink issue on the same equipment."
          icon={comparison.epsOnlyGroups.length > 0 ? AlertTriangle : CheckCircle2}
          label="EPS Only"
          value={comparison.epsOnlyGroups.length}
        />
        <SummaryMetricCard
          className={
            comparison.issueOnlyGroups.length > 0
              ? "border-amber-200 bg-amber-50/80 text-amber-950"
              : "border-emerald-200 bg-emerald-50/70 text-emerald-950"
          }
          description="Infralink issues with no EPS failed item on the same equipment."
          icon={comparison.issueOnlyGroups.length > 0 ? AlertTriangle : CheckCircle2}
          label="Issue Only"
          value={comparison.issueOnlyGroups.length}
        />
      </section>

      <Card>
        <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>EPS Failed Tests vs Infralink Issues</CardTitle>
            <CardDescription>
              Counts include open and resolved issues because EPS failures can be resolved after issue creation.
            </CardDescription>
          </div>
          <StatusBadge tone={comparison.mismatchGroups.length > 0 ? "warning" : "success"}>
            {comparison.mismatchGroups.length > 0
              ? `${formatNumber(comparison.mismatchGroups.length)} equipment mismatches`
              : "No equipment mismatch"}
          </StatusBadge>
        </CardHeader>
        <CardContent>
          {comparison.mismatchGroups.length === 0 ? (
            <EmptyState
              title="Open issues and EPS failed tests align by equipment."
              description="There are no EPS-only or issue-only equipment groups in the current data."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Equipment / Module</th>
                    <th className="px-3 py-2 font-medium">PDM</th>
                    <th className="px-3 py-2 text-right font-medium">Issues</th>
                    <th className="px-3 py-2 text-right font-medium">EPS Failed Tests</th>
                    <th className="px-3 py-2 text-right font-medium">Delta</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.mismatchGroups.map((group) => (
                    <tr className="border-b align-top last:border-0" key={group.equipmentKey}>
                      <td className="px-3 py-3 font-semibold">{group.equipmentKey}</td>
                      <td className="px-3 py-3">
                        {group.pdmNames.length > 0 ? group.pdmNames.join(", ") : "--"}
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(group.issueCount)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(group.failedItemCount)}</td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-semibold",
                          group.delta > 0 ? "text-red-700" : "text-amber-700",
                        )}
                      >
                        {group.delta > 0 ? "+" : ""}
                        {formatNumber(group.delta)}
                      </td>
                      <td className="px-3 py-3">
                        <details className="group">
                          <summary className="cursor-pointer font-medium text-primary">
                            Show issues and failed tests
                          </summary>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div>
                              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                Infralink Issues
                              </div>
                              <IssueList issues={group.issues} />
                            </div>
                            <div>
                              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                EPS Failed Tests
                              </div>
                              <FailedItemList items={group.failedItems} />
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
