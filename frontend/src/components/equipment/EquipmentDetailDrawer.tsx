import { Repeat2, X } from "lucide-react";
import { useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import type { CaseIssue } from "../../types/data";
import { formatDateTime, formatNumber } from "../../utils/formatters";
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
import { EpsTestItemsPanel } from "../common/EpsTestItemsPanel";
import { NetaReportChips } from "../common/NetaReportChips";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { EquipmentCaseList } from "./EquipmentCaseList";
import { EquipmentNetaBadge } from "./EquipmentNetaBadge";
import { EquipmentPdmAssociations } from "./EquipmentPdmAssociations";

interface EquipmentDetailDrawerProps {
  equipment: FlattenedEquipmentRow | null;
  associatedRows: FlattenedEquipmentRow[];
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

function NetaReportNames({ value }: { value: string | null }) {
  const manifest = useNetaReportManifest();
  const [nameMode, setNameMode] = useState<NetaReportNameMode>("original");
  const reportNames = getNetaReportNames(value);
  const canShowGcNames = hasGcNetaReportLinks(reportNames, manifest);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">NETA Test Report</div>
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
            <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <NetaReportChips
        className="mt-2"
        compactNameMode={nameMode}
        reports={reportNames}
        showLinkedFileNames
      />
    </div>
  );
}

export function EquipmentDetailDrawer({
  equipment,
  associatedRows,
  onClose,
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
          <div className="grid gap-4">
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
                  <Field label="NETA Completed Time" value={formatDateTime(equipment.neta_completed_at)} />
                  <Field label="Open Case Count" value={formatNumber(openCaseCount)} />
                  <Field label="Cases Missing Issue Image" value={formatNumber(missingImageCount)} />
                </div>
                <div>
                  <NetaReportNames value={equipment.neta_test_report} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">EPS Test Execution</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Field test items matched to this equipment from the EPS tracker.
                  </p>
                </div>
                <EpsTestItemsPanel items={equipment.eps_test_items} />
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
