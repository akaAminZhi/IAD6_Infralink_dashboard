import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import type { CaseIssue, PdmEquipmentRecord, PdmRecord } from "../../types/data";
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
  getPdmEquipmentCount,
  getPdmOpenCaseCount,
  getPdmReadinessLevel,
  getPdmReadinessScore,
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
  onClose: () => void;
}

function valueOrDash(value: string | number | null | undefined): string {
  return isBlank(value) ? "--" : String(value);
}

function firstText(...values: Array<unknown>): string | null {
  const value = values.find((candidate) => !isIssueBlank(candidate));
  return value === undefined ? null : String(value).trim();
}

function SummaryMetric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-md border bg-background p-3", className)}>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
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

export function PdmDetailDrawer({ pdm, onClose }: PdmDetailDrawerProps) {
  const [selectedIssue, setSelectedIssue] = useState<EnrichedIssue | null>(null);
  const pdmIssues = useMemo(() => (pdm ? getPdmIssues(pdm) : []), [pdm]);

  useEffect(() => {
    setSelectedIssue(null);
  }, [pdm?.pdm_name]);

  if (!pdm) {
    return null;
  }

  const equipment = pdm.equipment ?? [];
  const readinessLevel = getPdmReadinessLevel(pdm);
  const readinessScore = getPdmReadinessScore(pdm);
  const missingIssueImages = getCasesMissingIssueImageCount(pdm);
  const missingReports = getMissingNetaReportCount(pdm);
  const openCases = getPdmOpenCaseCount(pdm);

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
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryMetric label="PDM Name" value={valueOrDash(pdm.pdm_name)} />
                  <SummaryMetric label="Equipment Count" value={formatNumber(getPdmEquipmentCount(pdm))} />
                  <SummaryMetric label="Current Readiness" value={readinessLevel} />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <SummaryMetric
                    className="border-emerald-200 bg-emerald-50/60"
                    label="NETA Complete"
                    value={formatNumber(getNetaCompleteCount(pdm))}
                  />
                  <SummaryMetric
                    className={getNetaIncompleteCount(pdm) > 0 ? "border-amber-200 bg-amber-50/70" : ""}
                    label="NETA Incomplete"
                    value={formatNumber(getNetaIncompleteCount(pdm))}
                  />
                  <SummaryMetric
                    className={missingReports > 0 ? "border-red-200 bg-red-50/70" : ""}
                    label="Missing NETA Reports"
                    value={formatNumber(missingReports)}
                  />
                  <SummaryMetric
                    className={openCases > 0 ? "border-amber-200 bg-amber-50/70" : ""}
                    label="Open Cases"
                    value={formatNumber(openCases)}
                  />
                  <SummaryMetric
                    className={missingIssueImages > 0 ? "border-red-200 bg-red-50/70" : ""}
                    label="Cases Missing Issue Image"
                    value={formatNumber(missingIssueImages)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Equipment Under This PDM</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Expand an equipment row for manufacturer, NETA report details, and related cases.
                  </p>
                </div>
                <PdmEquipmentList equipment={equipment} />
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
