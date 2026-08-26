import { Activity, ShieldCheck, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { formatNumber } from "../../utils/formatters";
import type {
  CaseIssue,
  EpsModuleExecutionRecord,
  EpsPdmExecutionRecord,
  EpsTestItemRecord,
  PdmEquipmentRecord,
  PdmRecord,
} from "../../types/data";
import {
  getDueState,
  hasCorrectiveImages,
  hasIssueImage,
  isBlank as isIssueBlank,
  type EnrichedIssue,
} from "../../utils/issueUtils";
import {
  getCasesMissingIssueImageCount,
  getMissingNetaReportCount,
  getNetaCompleteCount,
  getNetaIncompleteCount,
  getPdmOpenCaseCount,
  getPdmReadinessLevel,
  getPdmReadinessScore,
  getTrackedEquipmentCount,
  isBlank,
} from "../../utils/pdmUtils";
import { IssueDetailDrawer } from "../issues/IssueDetailDrawer";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { PdmEquipmentList } from "./PdmEquipmentList";
import { PdmIssueTable } from "./PdmIssueTable";
import { PdmReadinessBadge } from "./PdmReadinessBadge";

interface PdmDetailDrawerProps {
  pdm: PdmRecord | null;
  epsModuleExecution: EpsModuleExecutionRecord[];
  epsPdmExecution: EpsPdmExecutionRecord[];
  epsTestItems: EpsTestItemRecord[];
  onClose: () => void;
}

function valueOrDash(value: string | number | null | undefined): string {
  return isBlank(value) ? "--" : String(value);
}

function firstText(...values: Array<unknown>): string | null {
  const value = values.find((candidate) => !isIssueBlank(candidate));
  return value === undefined ? null : String(value).trim();
}

function normalizePdmKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

type SummaryStatusTone = "default" | "info" | "success" | "warning" | "danger" | "teal";

const summaryStatusToneClasses: Record<SummaryStatusTone, string> = {
  default: "bg-slate-400",
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  teal: "bg-teal-500",
};

function SummaryStatus({
  label,
  value,
  tone = "default",
  highlight = false,
}: {
  label: string;
  value: number;
  tone?: SummaryStatusTone;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 whitespace-nowrap text-sm ${
        highlight ? "font-medium text-slate-900" : "text-muted-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          highlight ? summaryStatusToneClasses[tone] : summaryStatusToneClasses.default
        }`}
      />
      <span>{label}</span>
      <strong className={highlight ? "text-slate-950" : "text-slate-700"}>
        {formatNumber(value)}
      </strong>
    </div>
  );
}

function SummaryProgress({
  barClassName,
  completed,
  icon,
  label,
  total,
}: {
  barClassName: string;
  completed: number;
  icon: ReactNode;
  label: string;
  total: number;
}) {
  const safeTotal = Math.max(total, 0);
  const safeCompleted = Math.min(Math.max(completed, 0), safeTotal);
  const percentage = safeTotal > 0 ? (safeCompleted / safeTotal) * 100 : 0;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <strong className="text-2xl font-semibold text-slate-950">
          {formatNumber(safeCompleted)} / {formatNumber(safeTotal)}
        </strong>
        <span className="text-sm text-muted-foreground">equipment</span>
      </div>
      <div
        aria-label={`${label}: ${formatNumber(safeCompleted)} of ${formatNumber(safeTotal)}`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemax={safeTotal}
        aria-valuemin={0}
        aria-valuenow={safeCompleted}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barClassName}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function makePdmIssueRow(
  caseItem: CaseIssue,
  equipment: PdmEquipmentRecord,
  pdm: PdmRecord,
  index: number,
): EnrichedIssue {
  const equipmentId = firstText(caseItem.equipment_id, equipment.equipment_id);

  return {
    row_id: `${caseItem.case_id ?? "case"}-${equipmentId ?? "equipment"}-${index}`,
    case_id: firstText(caseItem.case_id),
    status: firstText(caseItem.status),
    priority: firstText(caseItem.priority),
    summary: firstText(caseItem.summary),
    equipment_id: equipmentId,
    system_element_raw: firstText(caseItem.system_element_raw),
    assigned_to: firstText(caseItem.assigned_to),
    reported_on: firstText(caseItem.reported_on),
    due_date: firstText(caseItem.due_date),
    created_at: firstText(caseItem.created_at),
    last_updated_at: firstText(caseItem.last_updated_at),
    issue_image: firstText(caseItem.issue_image),
    corrective_images: firstText(caseItem.corrective_images),
    has_issue_image: hasIssueImage(caseItem),
    has_corrective_images: hasCorrectiveImages(caseItem),
    due_state: getDueState(caseItem),
    pdm_name: firstText(pdm.pdm_name),
    equipment_type: firstText(equipment.equipment_type),
    equipment_status: firstText(equipment.status),
    manufacturer: firstText(equipment.manufacturer),
    model: firstText(equipment.model),
    serial_number: firstText(equipment.serial_number),
    neta_complete: equipment.neta_complete ?? null,
    neta_completed_at: firstText(equipment.neta_completed_at),
    neta_test_report: firstText(equipment.neta_test_report),
    neta_report_status: firstText(equipment.neta_report_status),
  };
}

function getPdmIssues(pdm: PdmRecord): EnrichedIssue[] {
  const issues: EnrichedIssue[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const equipment of pdm.equipment ?? []) {
    for (const caseItem of equipment.cases ?? []) {
      const issue = makePdmIssueRow(caseItem, equipment, pdm, index);
      const key = [
        issue.case_id,
        issue.equipment_id,
        issue.summary,
      ].map((value) => String(value ?? "").trim().toUpperCase()).join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      issues.push(issue);
      index += 1;
    }
  }

  return issues.sort((a, b) => {
    const aTime = Date.parse(a.last_updated_at ?? a.created_at ?? "");
    const bTime = Date.parse(b.last_updated_at ?? b.created_at ?? "");
    const safeATime = Number.isNaN(aTime) ? 0 : aTime;
    const safeBTime = Number.isNaN(bTime) ? 0 : bTime;

    return safeBTime - safeATime || String(a.case_id ?? "").localeCompare(String(b.case_id ?? ""));
  });
}

export function PdmDetailDrawer({
  pdm,
  epsModuleExecution,
  epsPdmExecution,
  epsTestItems,
  onClose,
}: PdmDetailDrawerProps) {
  const [selectedIssue, setSelectedIssue] = useState<EnrichedIssue | null>(null);
  const pdmIssues = useMemo(() => (pdm ? getPdmIssues(pdm) : []), [pdm]);

  useEffect(() => {
    setSelectedIssue(null);
  }, [pdm?.pdm_name]);

  if (!pdm) {
    return null;
  }

  const equipment = pdm.equipment ?? [];
  const epsExecution = epsPdmExecution.find(
    (record) => normalizePdmKey(record.pdm_name) === normalizePdmKey(pdm.pdm_name),
  );
  const pdmEpsModuleExecution = epsModuleExecution.filter(
    (record) => normalizePdmKey(record.pdm_name) === normalizePdmKey(pdm.pdm_name),
  );
  const readinessLevel = getPdmReadinessLevel(pdm, epsExecution);
  const readinessScore = getPdmReadinessScore(pdm, epsExecution);
  const missingIssueImages = getCasesMissingIssueImageCount(pdm);
  const missingReports = getMissingNetaReportCount(pdm);
  const openCases = getPdmOpenCaseCount(pdm);
  const trackedEquipmentCount = getTrackedEquipmentCount(pdm);
  const epsStarted = epsExecution?.started_module_equipment_count ?? 0;
  const epsComplete = epsExecution?.complete_count ?? 0;
  const epsWaitingNeta = epsExecution?.waiting_infralink_neta_count ?? 0;
  const epsPartial = epsExecution?.partial_count ?? 0;
  const epsFailed = epsExecution?.failed_count ?? 0;
  const epsNotStarted = epsExecution?.not_started_count ?? 0;
  const epsNoTracker = epsExecution?.no_tracker_record_count ?? 0;
  const netaComplete = getNetaCompleteCount(pdm);
  const netaIncomplete = getNetaIncompleteCount(pdm);

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close PDM detail overlay"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col overflow-hidden border-l bg-background shadow-xl xl:w-[78vw]">
        <header className="border-b bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-semibold tracking-normal">
                  {valueOrDash(pdm.pdm_name)}
                </h2>
                <PdmReadinessBadge level={readinessLevel} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Readiness score {formatNumber(readinessScore)}
              </p>
            </div>
            <Button aria-label="Close PDM detail" onClick={onClose} type="button" variant="ghost">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4">
            <Card>
              <CardContent className="p-0">
                <div className="grid gap-5 p-4 lg:grid-cols-[260px_1fr] lg:items-center">
                  <SummaryProgress
                    barClassName="bg-blue-600"
                    completed={epsStarted}
                    icon={<Activity className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                    label="EPS Execution Started"
                    total={trackedEquipmentCount}
                  />
                  <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-3">
                    <SummaryStatus
                      highlight={epsComplete > 0}
                      label="Complete"
                      tone="success"
                      value={epsComplete}
                    />
                    <SummaryStatus
                      highlight={epsPartial > 0}
                      label="In Progress"
                      tone="info"
                      value={epsPartial}
                    />
                    <SummaryStatus
                      highlight={epsWaitingNeta > 0}
                      label="Waiting NETA"
                      tone="teal"
                      value={epsWaitingNeta}
                    />
                    <SummaryStatus
                      highlight={epsFailed > 0}
                      label="Failed"
                      tone="danger"
                      value={epsFailed}
                    />
                    <SummaryStatus
                      highlight={epsNotStarted > 0}
                      label="Not Started"
                      tone="warning"
                      value={epsNotStarted}
                    />
                    <SummaryStatus
                      highlight={epsNoTracker > 0}
                      label="No Tracker Data"
                      value={epsNoTracker}
                    />
                  </div>
                </div>

                <div className="grid gap-5 border-t bg-slate-50/60 p-4 lg:grid-cols-[260px_1fr] lg:items-center">
                  <SummaryProgress
                    barClassName="bg-emerald-600"
                    completed={netaComplete}
                    icon={<ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    label="Infralink NETA Complete"
                    total={trackedEquipmentCount}
                  />
                  <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-3">
                    <SummaryStatus
                      highlight={netaIncomplete > 0}
                      label="NETA Incomplete"
                      tone="warning"
                      value={netaIncomplete}
                    />
                    <SummaryStatus
                      highlight={missingReports > 0}
                      label="Missing Reports"
                      tone="danger"
                      value={missingReports}
                    />
                    <SummaryStatus
                      highlight={openCases > 0}
                      label="Open Cases"
                      tone="danger"
                      value={openCases}
                    />
                    <SummaryStatus
                      highlight={missingIssueImages > 0}
                      label="Missing Images"
                      tone="danger"
                      value={missingIssueImages}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Equipment Under This PDM</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    EPS execution shows field-test progress separately from Infralink NETA readiness.
                  </p>
                </div>
                <PdmEquipmentList
                  equipment={equipment}
                  epsModuleExecution={pdmEpsModuleExecution}
                  epsTestItems={epsTestItems}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Issues Under This PDM</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select an issue row to review priority, assignment, due date, asset information, and attachments.
                  </p>
                </div>
                <PdmIssueTable
                  issues={pdmIssues}
                  onSelectIssue={setSelectedIssue}
                  selectedIssueId={selectedIssue?.row_id ?? null}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>
      <IssueDetailDrawer issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
    </div>
  );
}
