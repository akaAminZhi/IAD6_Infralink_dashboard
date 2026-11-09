import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, Repeat2, X, XCircle } from "lucide-react";
import { useId, useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { NetaDuplicatePanel } from "../common/NetaDuplicatePanel";
import { NetaDuplicateBadge } from "../common/NetaDuplicateBadge";
import type {
  NetaReportReview,
  NetaReportReviewsResponse,
} from "../../types/automation";
import type { CaseIssue } from "../../types/data";
import { updateNetaReportReview } from "../../utils/automationApi";
import { cn } from "../../utils/cn";
import { formatDateTime, formatNumber } from "../../utils/formatters";
import { requiresEquipmentTestTracking } from "../../utils/equipmentTrackingUtils";
import {
  getCasesMissingIssueImageCount,
  getNetaReportNames,
  getOpenCaseCount,
  isBlank,
  type FlattenedEquipmentRow,
} from "../../utils/equipmentUtils";
import {
  hasGcNetaReportLinks,
  type NetaReportNameMode,
} from "../../utils/netaReports";
import { getNetaReviewsForReport } from "../../utils/netaReportReviews";
import { getReportDuplicates } from "../../utils/netaDuplicates";
import { EpsTestItemsPanel } from "../common/EpsTestItemsPanel";
import { EquipmentExternalLinks } from "../common/EquipmentExternalLinks";
import { EquipmentUpdateInfo } from "../common/EquipmentUpdateInfo";
import { NetaReportChips } from "../common/NetaReportChips";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { EquipmentCaseList } from "./EquipmentCaseList";
import { CxalloyReportUploadPanel } from "./CxalloyReportUploadPanel";
import { EquipmentNetaBadge } from "./EquipmentNetaBadge";
import { EquipmentCableAtpEvidence } from "./EquipmentCableAtpEvidence";
import { EquipmentPdmAssociations } from "./EquipmentPdmAssociations";

interface EquipmentDetailDrawerProps {
  equipment: FlattenedEquipmentRow | null;
  associatedRows: FlattenedEquipmentRow[];
  netaReportReviews: NetaReportReviewsResponse | null;
  netaReviewsEditable?: boolean;
  onClose: () => void;
  onNetaReportReviewUpdated: (review: NetaReportReview) => void;
}

function valueOrDash(value: string | number | boolean | null | undefined): string {
  return isBlank(value) ? "--" : String(value);
}

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{valueOrDash(value)}</div>
    </div>
  );
}

function mergeCases(rows: FlattenedEquipmentRow[]): CaseIssue[] {
  const merged: CaseIssue[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const caseItem of row.cases) {
      const key = !isBlank(caseItem.case_id) ? String(caseItem.case_id).trim() : JSON.stringify(caseItem);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(caseItem);
    }
  }

  return merged;
}

function reviewTone(status: NetaReportReview["status"] | null) {
  if (status === "FAILED") {
    return {
      container: "border-red-300 bg-red-50",
      label: "text-red-800",
      text: "Failed",
    };
  }
  if (status === "REVIEW_REQUIRED" || status === "ERROR") {
    return {
      container: "border-orange-300 bg-orange-50",
      label: "text-orange-800",
      text: status === "ERROR" ? "Review required (scan error)" : "Review required",
    };
  }
  if (status === "PASSED") {
    return {
      container: "border-green-300 bg-green-50",
      label: "text-green-800",
      text: "Passed",
    };
  }
  return {
    container: "border-slate-200 bg-slate-50",
    label: "text-slate-600",
    text: "Not checked",
  };
}

function NetaReportNames({
  value,
  equipmentId,
  reviews,
  onReviewUpdated,
  editable,
}: {
  value: string | null;
  equipmentId: string | null;
  reviews: NetaReportReviewsResponse | null;
  onReviewUpdated: (review: NetaReportReview) => void;
  editable: boolean;
}) {
  const manifest = useNetaReportManifest();
  const disclosureId = useId();
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const [nameMode, setNameMode] = useState<NetaReportNameMode>("original");
  const [savingFile, setSavingFile] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const reportNames = getNetaReportNames(value);
  const canShowGcNames = hasGcNetaReportLinks(reportNames, manifest, equipmentId);

  async function handleStatusChange(file: string, status: "PASSED" | "FAILED") {
    if (!editable) return;
    setSavingFile(file);
    setSaveError(null);
    try {
      const response = await updateNetaReportReview(file, status);
      onReviewUpdated(response.report);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to update the review result.");
    } finally {
      setSavingFile(null);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">NETA Test Report</h4>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{reportNames.length}</span>
          {!editable && reviews ? <span className="text-xs text-muted-foreground">Read only</span> : null}
        </div>
        {canShowGcNames ? (
          <button
            aria-label="Toggle NETA report names between original and GC"
            aria-pressed={nameMode === "gc"}
            className="rounded-md border px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
            onClick={() =>
              setNameMode((currentMode) => (currentMode === "original" ? "gc" : "original"))
            }
            title={nameMode === "original" ? "Show GC names" : "Show original names"}
            type="button"
          >
            <span className="flex items-center gap-1.5 text-xs"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />{nameMode === "gc" ? "GC names" : "Original names"}</span>
          </button>
        ) : null}
      </div>
      <ul className="mt-3 divide-y overflow-hidden rounded-md border bg-muted/10" aria-label="NETA report list">
        {reportNames.map((reportName, reportIndex) => {
          const duplicates = getReportDuplicates(manifest, equipmentId, reportName);
          const matchedReviews = getNetaReviewsForReport(reportName, reviews, manifest);
          const primaryStatus = matchedReviews.some((review) => review.status === "FAILED")
            ? "FAILED"
            : matchedReviews.some(
                  (review) => review.status === "REVIEW_REQUIRED" || review.status === "ERROR",
                )
              ? "REVIEW_REQUIRED"
              : matchedReviews.some((review) => review.status === "PASSED")
                ? "PASSED"
                : null;
          const tone = reviews
            ? reviewTone(primaryStatus)
            : {
                container: "border-slate-200 bg-slate-50",
                label: "text-slate-600",
                text: "Review data unavailable",
              };
          const evidenceReviews = matchedReviews.filter((review) => review.status !== "PASSED" || review.evidence?.length);
          const StatusIcon = primaryStatus === "PASSED" ? CheckCircle2 : primaryStatus === "FAILED" ? XCircle
            : primaryStatus === "REVIEW_REQUIRED" ? AlertTriangle : CircleHelp;
          const reportKey = `${equipmentId}:${reportName}`;
          const expanded = expandedReports.has(reportKey);
          const hasDetails = evidenceReviews.length > 0 || editable && matchedReviews.length > 0;
          const panelId = `${disclosureId}-${reportIndex}`;
          return (
            <li className="min-w-0" data-review-status={primaryStatus ?? "NOT_CHECKED"} key={reportName}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_6rem]">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <NetaReportChips equipmentId={equipmentId} compactNameMode={nameMode}
                    reports={[reportName]} showLinkedFileNames listAppearance showDuplicateBadge={false} className="grid-cols-1 lg:grid-cols-1" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[19rem] sm:justify-self-end sm:justify-end">
                  <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium", tone.container, tone.label)}>
                    <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />{tone.text}
                  </span>
                  <NetaDuplicateBadge matches={duplicates} />
                </div>
                {hasDetails ? <button type="button" aria-expanded={expanded} aria-controls={panelId}
                  aria-label={`${evidenceReviews.length ? "Evidence" : "Review"} for ${reportName}`}
                  className="inline-flex items-center justify-self-end gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setExpandedReports((current) => {
                    const next = new Set(current);
                    if (next.has(reportKey)) next.delete(reportKey); else next.add(reportKey);
                    return next;
                  })}>
                  <ChevronRight className={cn("h-3.5 w-3.5", expanded && "rotate-90")} aria-hidden="true" />
                  {evidenceReviews.length ? "Evidence" : "Review"}
                </button> : <span className="hidden sm:block" />}
              </div>
              {hasDetails ? <div id={panelId} hidden={!expanded} className="space-y-3 border-t bg-muted/20 px-4 py-3">
                {editable && matchedReviews.map((review) => (
                  <label className="flex flex-wrap items-center gap-2 text-xs" key={review.file}>
                    <span className="font-medium">Review result</span>
                    {matchedReviews.length > 1 ? <span className="min-w-0 break-all text-muted-foreground">{review.file}</span> : null}
                    <select aria-label={`Review result for ${reportName}`}
                      className="h-8 rounded-md border bg-background px-2 font-semibold outline-none focus:ring-2 focus:ring-ring"
                      disabled={savingFile !== null}
                      onChange={(event) => void handleStatusChange(review.file, event.target.value as "PASSED" | "FAILED")}
                      value={review.status === "PASSED" || review.status === "FAILED" ? review.status : ""}>
                      <option disabled value="">Review required</option>
                      <option value="PASSED">PASS</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </label>
                ))}
                {evidenceReviews.map((review) => (
                  <div className={cn("text-xs leading-relaxed", tone.label)} key={review.file}>
                    {matchedReviews.length > 1 ? <div className="break-all font-medium">{review.file}</div> : null}
                    {review.evidence?.length ? review.evidence.map((line, index) => (
                      <p className="mt-1 whitespace-pre-wrap break-words" key={index}>{line}</p>
                    )) : <p>No evidence provided in the check results.</p>}
                  </div>
                ))}
              </div> : null}
            </li>
          );
        })}
      </ul>
      {reportNames.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">--</div>
      ) : null}
      {saveError ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          {saveError}
        </div>
      ) : null}
    </div>
  );
}

export function EquipmentDetailDrawer({
  equipment,
  associatedRows,
  netaReportReviews,
  netaReviewsEditable = false,
  onClose,
  onNetaReportReviewUpdated,
}: EquipmentDetailDrawerProps) {
  if (!equipment) {
    return null;
  }

  const rows = associatedRows.length > 0 ? associatedRows : [equipment];
  const relatedCases = mergeCases(rows);
  const openCaseCount = rows.reduce((total, row) => total + getOpenCaseCount(row), 0);
  const missingImageCount = rows.reduce(
    (total, row) => total + getCasesMissingIssueImageCount(row),
    0,
  );
  const pdmNames = rows
    .map((row) => row.pdm_name)
    .filter((name): name is string => !isBlank(name));
  const trackingRequired = requiresEquipmentTestTracking(equipment);

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close equipment detail overlay"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col overflow-hidden border-l bg-background shadow-xl xl:w-[78vw]">
        <header className="border-b bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold tracking-normal">
                {equipment.display_equipment_id}
              </h2>
              <EquipmentExternalLinks equipmentId={equipment.equipment_id} />
              <p className="mt-1 text-sm text-muted-foreground">
                {equipment.status ?? "Unknown status"} - {pdmNames.length > 1 ? "Multiple PDMs" : pdmNames[0] ?? "No PDM association"}
              </p>
            </div>
            <Button aria-label="Close equipment detail" onClick={onClose} type="button" variant="ghost">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Equipment Summary</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current equipment status, NETA readiness, and issue visibility.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Equipment ID or Source Label" value={equipment.display_equipment_id} />
                  <Field label="Current Status" value={equipment.status} />
                  <Field label="Equipment Type" value={equipment.equipment_type} />
                  <Field label="PDM Name" value={pdmNames.length > 1 ? `${pdmNames.length} PDMs` : pdmNames[0]} />
                  <div className="min-w-0 rounded-md border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">NETA Status</div>
                    <div className="mt-2">
                      <EquipmentNetaBadge equipment={equipment} />
                    </div>
                  </div>
                  <Field
                    label="NETA Completed Time"
                    value={trackingRequired ? formatDateTime(equipment.neta_completed_at) : "--"}
                  />
                  <Field label="Open Case Count" value={formatNumber(openCaseCount)} />
                  <Field label="Cases Missing Issue Image" value={formatNumber(missingImageCount)} />
                </div>
                <EquipmentUpdateInfo updated_by={equipment.updated_by} updated_at={equipment.updated_at} />
                {trackingRequired ? <div>
                  <NetaReportNames
                    equipmentId={equipment.equipment_id}
                    editable={netaReviewsEditable}
                    onReviewUpdated={onNetaReportReviewUpdated}
                    reviews={netaReportReviews}
                    value={equipment.neta_test_report}
                  />
                  <EquipmentCableAtpEvidence equipment={equipment} />
                  <NetaDuplicatePanel key={equipment.equipment_id} equipmentId={equipment.equipment_id} />
                </div> : null}
                {trackingRequired && equipment.cxalloy_upload_status ? (
                  <CxalloyReportUploadPanel equipment={equipment} />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Asset Information</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Manufacturer" value={equipment.manufacturer} />
                  <Field label="Model" value={equipment.model} />
                  <Field label="Serial Number" value={equipment.serial_number} />
                </div>
              </CardContent>
            </Card>

            {trackingRequired ? <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">EPS Test Execution</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Field test items matched to this equipment from the EPS tracker.
                  </p>
                </div>
                <EpsTestItemsPanel items={equipment.eps_test_items} />
              </CardContent>
            </Card> : null}

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">PDM Associations</h3>
                </div>
                <EquipmentPdmAssociations rows={rows} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Related Cases / Issues</h3>
                </div>
                <EquipmentCaseList cases={relatedCases} />
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>
    </div>
  );
}
