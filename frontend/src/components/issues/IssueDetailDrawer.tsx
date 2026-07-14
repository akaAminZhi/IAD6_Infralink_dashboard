import { Repeat2, X } from "lucide-react";
import { useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { formatDateTime } from "../../utils/formatters";
import {
  getNetaReportReferences,
  isBlank,
  type EnrichedIssue,
} from "../../utils/issueUtils";
import {
  hasGcNetaReportLinks,
  type NetaReportNameMode,
} from "../../utils/netaReports";
import { EmptyState } from "../common/EmptyState";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { CorrectiveImagesBadge } from "./CorrectiveImagesBadge";
import { IssueDueStateBadge } from "./IssueDueStateBadge";
import { IssueEquipmentNetaBadge } from "./IssueEquipmentNetaBadge";
import { IssueImageBadge } from "./IssueImageBadge";
import { IssueNetaReportBadge } from "./IssueNetaReportBadge";
import { IssuePriorityBadge } from "./IssuePriorityBadge";
import { IssueStatusBadge } from "./IssueStatusBadge";

interface IssueDetailDrawerProps {
  issue: EnrichedIssue | null;
  onClose: () => void;
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

export function IssueDetailDrawer({ issue, onClose }: IssueDetailDrawerProps) {
  const manifest = useNetaReportManifest();
  const [netaReportNameMode, setNetaReportNameMode] =
    useState<NetaReportNameMode>("original");

  if (!issue) {
    return null;
  }

  const netaReportNames = getNetaReportReferences(issue.neta_test_report);
  const canShowGcNames = hasGcNetaReportLinks(netaReportNames, manifest);
  const hasAssetInformation =
    !isBlank(issue.equipment_type) ||
    !isBlank(issue.manufacturer) ||
    !isBlank(issue.model) ||
    !isBlank(issue.serial_number);

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close issue detail overlay"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-5xl flex-col overflow-hidden border-l bg-background shadow-xl xl:w-[74vw]">
        <header className="border-b bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold tracking-normal">
                {issue.case_id ?? "Unknown case"}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <IssueStatusBadge status={issue.status} />
                <IssuePriorityBadge priority={issue.priority} />
                <IssueDueStateBadge dueState={issue.due_state} />
              </div>
            </div>
            <Button aria-label="Close issue detail" onClick={onClose} type="button" variant="ghost">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Issue Summary</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Case ID" value={issue.case_id} />
                  <Field label="Status" value={issue.status} />
                  <Field label="Priority" value={issue.priority} />
                  <Field label="Assigned To" value={issue.assigned_to} />
                  <Field label="Reported On" value={formatDateTime(issue.reported_on)} />
                  <Field label="Due Date" value={formatDateTime(issue.due_date)} />
                  <div className="min-w-0 rounded-md border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Due State</div>
                    <div className="mt-2">
                      <IssueDueStateBadge dueState={issue.due_state} />
                    </div>
                  </div>
                  <Field label="Created At" value={formatDateTime(issue.created_at)} />
                  <Field label="Last Updated" value={formatDateTime(issue.last_updated_at)} />
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-muted-foreground">Summary</div>
                  <div className="mt-2 whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
                    {issue.summary ?? "--"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Equipment and PDM Context</h3>
                </div>
                {isBlank(issue.equipment_id) && isBlank(issue.equipment_status) ? (
                  <EmptyState title="No related equipment context found." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Equipment ID" value={issue.equipment_id} />
                    <Field label="Equipment Status" value={issue.equipment_status} />
                    {isBlank(issue.pdm_name) ? (
                      <div className="xl:col-span-1">
                        <EmptyState title="No related PDM context found." />
                      </div>
                    ) : (
                      <Field label="PDM Name" value={issue.pdm_name} />
                    )}
                    <div className="min-w-0 rounded-md border bg-background p-3">
                      <div className="text-xs font-medium uppercase text-muted-foreground">NETA Status</div>
                      <div className="mt-2">
                        <IssueEquipmentNetaBadge issue={issue} />
                      </div>
                    </div>
                    <Field label="NETA Completed Time" value={formatDateTime(issue.neta_completed_at)} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Asset Information</h3>
                </div>
                {hasAssetInformation ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Equipment Type" value={issue.equipment_type} />
                    <Field label="Manufacturer" value={issue.manufacturer} />
                    <Field label="Model" value={issue.model} />
                    <Field label="Serial Number" value={issue.serial_number} />
                  </div>
                ) : (
                  <EmptyState title="No asset information found." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Issue Image</h3>
                </div>
                <IssueImageBadge issue={issue} showImageThumbnails />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Corrective Images</h3>
                </div>
                <CorrectiveImagesBadge issue={issue} showImageThumbnails />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Related Equipment Readiness</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">NETA Status</div>
                    <div className="mt-2">
                      <IssueEquipmentNetaBadge issue={issue} />
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        NETA Test Report
                      </div>
                      {canShowGcNames ? (
                        <button
                          aria-label="Toggle NETA report names between original and GC"
                          aria-pressed={netaReportNameMode === "gc"}
                          className="rounded-md border px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
                          onClick={() =>
                            setNetaReportNameMode((currentMode) =>
                              currentMode === "original" ? "gc" : "original",
                            )
                          }
                          title={
                            netaReportNameMode === "original"
                              ? "Show GC names"
                              : "Show original names"
                          }
                          type="button"
                        >
                          <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2">
                      <IssueNetaReportBadge
                        compactNameMode={netaReportNameMode}
                        issue={issue}
                        showLinkedFileNames
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>
    </div>
  );
}
