import { Repeat2 } from "lucide-react";
import { useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import type { EpsTestItemRecord, PdmEquipmentRecord } from "../../types/data";
import { formatDateTime, formatNumber } from "../../utils/formatters";
import {
  getNetaReportNames,
  hasGcNetaReportLinks,
  type NetaReportNameMode,
} from "../../utils/netaReports";
import {
  getEquipmentDisplayId,
  getOpenCaseCountForEquipment,
  isBlank,
} from "../../utils/pdmUtils";
import { EpsTestItemsPanel } from "../common/EpsTestItemsPanel";
import { NetaReportChips } from "../common/NetaReportChips";
import { NetaStatusBadge } from "./NetaStatusBadge";
import { PdmCaseList } from "./PdmCaseList";

interface PdmEquipmentDetailProps {
  equipment: PdmEquipmentRecord;
  epsTestItems: EpsTestItemRecord[];
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  const displayValue = isBlank(value) ? "--" : String(value);
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{displayValue}</div>
    </div>
  );
}

export function PdmEquipmentDetail({ equipment, epsTestItems }: PdmEquipmentDetailProps) {
  const manifest = useNetaReportManifest();
  const [netaReportNameMode, setNetaReportNameMode] =
    useState<NetaReportNameMode>("original");
  const reportNames = getNetaReportNames(equipment.neta_test_report);
  const canShowGcNames = hasGcNetaReportLinks(reportNames, manifest);

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{getEquipmentDisplayId(equipment)}</div>
          <div className="text-xs text-muted-foreground">{equipment.equipment_type ?? "--"}</div>
        </div>
        <NetaStatusBadge equipment={equipment} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Equipment ID / Source Label" value={getEquipmentDisplayId(equipment)} />
        <Field label="Equipment Type" value={equipment.equipment_type} />
        <Field label="Status" value={equipment.status} />
        <Field label="Parent" value={equipment.parent} />
        <Field label="System" value={equipment.system} />
        <Field label="Manufacturer" value={equipment.manufacturer} />
        <Field label="Model" value={equipment.model} />
        <Field label="Serial Number" value={equipment.serial_number} />
        <Field
          label="Open Issues From SystemElements"
          value={formatNumber(equipment.open_issues_count_from_system_elements ?? 0)}
        />
        <Field label="Calculated Open Cases" value={formatNumber(getOpenCaseCountForEquipment(equipment))} />
        <Field label="NETA Complete" value={equipment.neta_complete === true ? "Complete" : "Incomplete"} />
        <Field label="NETA Completed At" value={formatDateTime(equipment.neta_completed_at)} />
        <Field label="NETA Report Status" value={equipment.neta_report_status} />
      </div>

      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">NETA Test Report</div>
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
              title={netaReportNameMode === "original" ? "Show GC names" : "Show original names"}
              type="button"
            >
              <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <NetaReportChips
          className="mt-2"
          compactNameMode={netaReportNameMode}
          reports={reportNames}
          showLinkedFileNames
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">EPS Test Execution</div>
        <EpsTestItemsPanel items={epsTestItems} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Related Cases</div>
        <PdmCaseList cases={equipment.cases ?? []} />
      </div>
    </div>
  );
}
