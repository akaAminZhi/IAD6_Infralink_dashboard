import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import type {
  EpsModuleExecutionRecord,
  EpsTestItemRecord,
  PdmEquipmentRecord,
} from "../../types/data";
import {
  buildEpsTestItemIndex,
  getIndexedEpsTestItems,
  normalizeEpsEquipmentKey,
} from "../../utils/epsTestItemUtils";
import { formatNumber } from "../../utils/formatters";
import { requiresEquipmentTestTracking } from "../../utils/equipmentTrackingUtils";
import { getNetaReportCount } from "../../utils/netaReports";
import {
  getEquipmentAttentionReasons,
  getEquipmentDisplayId,
  getOpenCaseCountForEquipment,
} from "../../utils/pdmUtils";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../ui/button";
import { NetaStatusBadge } from "./NetaStatusBadge";
import { PdmEquipmentDetail } from "./PdmEquipmentDetail";

interface PdmEquipmentListProps {
  equipment: PdmEquipmentRecord[];
  epsModuleExecution: EpsModuleExecutionRecord[];
  epsTestItems: EpsTestItemRecord[];
}

function buildEpsModuleExecutionIndex(
  records: EpsModuleExecutionRecord[],
): Map<string, EpsModuleExecutionRecord> {
  const index = new Map<string, EpsModuleExecutionRecord>();

  records.forEach((record) => {
    [record.matched_equipment_id, record.module_equipment_key, record.module_equipment]
      .map(normalizeEpsEquipmentKey)
      .filter(Boolean)
      .forEach((key) => {
        if (!index.has(key)) {
          index.set(key, record);
        }
      });
  });

  return index;
}

function getEpsModuleExecution(
  index: Map<string, EpsModuleExecutionRecord>,
  record: PdmEquipmentRecord,
): EpsModuleExecutionRecord | null {
  for (const identifier of [record.equipment_id, record.source_equipment_label]) {
    const match = index.get(normalizeEpsEquipmentKey(identifier));
    if (match) {
      return match;
    }
  }
  return null;
}

function getEpsStatusDisplay(record: EpsModuleExecutionRecord | null): {
  label: string;
  tone: "default" | "success" | "teal" | "danger" | "muted";
} {
  const status = String(record?.eps_test_status ?? "").trim();

  if (status === "Complete") {
    return { label: "Complete", tone: "success" };
  }
  if (status === "Complete, Waiting Infralink NETA Completion") {
    return { label: "Waiting Infralink NETA", tone: "teal" };
  }
  if (status === "Partial") {
    return { label: "In Progress", tone: "default" };
  }
  if (status === "Failed") {
    return { label: "Failed", tone: "danger" };
  }
  if (status === "Not Started") {
    return { label: "Not Started", tone: "muted" };
  }
  return { label: "No Tracker Data", tone: "muted" };
}

function EpsExecutionCell({
  record,
  trackingRequired,
}: {
  record: EpsModuleExecutionRecord | null;
  trackingRequired: boolean;
}) {
  if (!trackingRequired) {
    return <StatusBadge tone="muted">Not Tracked</StatusBadge>;
  }

  const status = getEpsStatusDisplay(record);
  const total = record?.tracker_item_count ?? 0;
  const completed = record?.completed_test_item_count ?? 0;
  const failed = record?.failed_test_item_count ?? 0;
  const remaining = record?.incomplete_test_item_count ?? 0;

  return (
    <div className="min-w-[170px]">
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      {total > 0 ? (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-slate-900">{formatNumber(completed)}</span>
            {" / "}
            {formatNumber(total)} complete
          </span>
          {failed > 0 ? (
            <span className="font-semibold text-red-700">{formatNumber(failed)} failed</span>
          ) : null}
          {remaining > 0 ? <span>{formatNumber(remaining)} remaining</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PdmEquipmentList({
  equipment,
  epsModuleExecution,
  epsTestItems,
}: PdmEquipmentListProps) {
  const [expandedEquipmentKey, setExpandedEquipmentKey] = useState<string | null>(null);
  const epsTestItemIndex = useMemo(
    () => buildEpsTestItemIndex(epsTestItems),
    [epsTestItems],
  );
  const epsModuleExecutionIndex = useMemo(
    () => buildEpsModuleExecutionIndex(epsModuleExecution),
    [epsModuleExecution],
  );
  const rows = useMemo(
    () =>
      equipment.map((record, index) => {
        const linkedTestItems = getIndexedEpsTestItems(epsTestItemIndex, [
          record.equipment_id,
          record.source_equipment_label,
        ]);
        return {
          record,
          key: `${record.equipment_id ?? record.source_equipment_label ?? "equipment"}-${index}`,
          reasons: getEquipmentAttentionReasons(record),
          openCases: getOpenCaseCountForEquipment(record),
          reportCount: getNetaReportCount(record.neta_test_report),
          trackingRequired: requiresEquipmentTestTracking(record),
          epsExecution: getEpsModuleExecution(epsModuleExecutionIndex, record),
          testItems: linkedTestItems,
        };
      }),
    [epsModuleExecutionIndex, epsTestItemIndex, equipment],
  );

  if (equipment.length === 0) {
    return (
      <EmptyState
        title="No equipment records found for this PDM."
        description="Run the ETL after confirming the module equipment list."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Equipment ID or Source Label</th>
            <th className="px-3 py-2 font-medium">Equipment Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">EPS Execution</th>
            <th className="px-3 py-2 font-medium">NETA</th>
            <th className="px-3 py-2 font-medium">NETA Test Report</th>
            <th className="px-3 py-2 text-right font-medium">Open Cases</th>
            <th className="px-3 py-2 font-medium">Attention Reasons</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(
            ({
              record,
              key,
              reasons,
              openCases,
              reportCount,
              trackingRequired,
              epsExecution,
              testItems,
            }) => {
              const isExpanded = expandedEquipmentKey === key;

            return (
              <Fragment key={key}>
                <tr className="border-b align-top last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <Button
                      className="h-auto justify-start px-0 py-0 text-left font-medium"
                      onClick={() => setExpandedEquipmentKey(isExpanded ? null : key)}
                      type="button"
                      variant="ghost"
                    >
                      {isExpanded ? (
                        <ChevronDown className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="break-words">{getEquipmentDisplayId(record)}</span>
                    </Button>
                  </td>
                  <td className="px-3 py-2">{record.equipment_type ?? "--"}</td>
                  <td className="px-3 py-2">{record.status ?? "--"}</td>
                  <td className="px-3 py-2">
                    <EpsExecutionCell
                      record={epsExecution}
                      trackingRequired={trackingRequired}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NetaStatusBadge equipment={record} />
                  </td>
                  <td className="px-3 py-2">{formatNumber(reportCount)}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      openCases > 0 ? "text-red-700" : ""
                    }`}
                  >
                    {formatNumber(openCases)}
                  </td>
                  <td className="px-3 py-2">
                    {reasons.length === 0 ? (
                      <StatusBadge tone="success">No attention reason</StatusBadge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((reason) => (
                          <StatusBadge
                            key={reason}
                            tone={reason.includes("Missing") ? "danger" : "warning"}
                          >
                            {reason}
                          </StatusBadge>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="border-b last:border-0">
                    <td className="px-3 py-3" colSpan={8}>
                      <PdmEquipmentDetail equipment={record} epsTestItems={testItems} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
            })}
        </tbody>
      </table>
    </div>
  );
}
