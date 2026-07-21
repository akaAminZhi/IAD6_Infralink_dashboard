import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import type { EpsTestItemRecord, PdmEquipmentRecord } from "../../types/data";
import { cn } from "../../utils/cn";
import {
  buildEpsTestItemIndex,
  getIndexedEpsTestItems,
} from "../../utils/epsTestItemUtils";
import { formatNumber } from "../../utils/formatters";
import { getNetaReportCount } from "../../utils/netaReports";
import {
  getEquipmentAttentionReasons,
  getEquipmentDisplayId,
  getOpenCaseCountForEquipment,
  hasMissingNetaReport,
  isNetaComplete,
} from "../../utils/pdmUtils";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../ui/button";
import { NetaStatusBadge } from "./NetaStatusBadge";
import { PdmEquipmentDetail } from "./PdmEquipmentDetail";

interface PdmEquipmentListProps {
  equipment: PdmEquipmentRecord[];
  epsTestItems: EpsTestItemRecord[];
}

export function PdmEquipmentList({ equipment, epsTestItems }: PdmEquipmentListProps) {
  const [expandedEquipmentKey, setExpandedEquipmentKey] = useState<string | null>(null);
  const epsTestItemIndex = useMemo(
    () => buildEpsTestItemIndex(epsTestItems),
    [epsTestItems],
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
          testItems: linkedTestItems,
        };
      }),
    [epsTestItemIndex, equipment],
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
      <table className="w-full min-w-[940px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Equipment ID or Source Label</th>
            <th className="px-3 py-2 font-medium">Equipment Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">NETA</th>
            <th className="px-3 py-2 font-medium">NETA Test Report</th>
            <th className="px-3 py-2 text-right font-medium">Open Cases</th>
            <th className="px-3 py-2 font-medium">Attention Reasons</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ record, key, reasons, openCases, reportCount, testItems }) => {
            const isExpanded = expandedEquipmentKey === key;
            const hasAttention =
              !isNetaComplete(record) ||
              hasMissingNetaReport(record) ||
              openCases > 0 ||
              reasons.includes("Missing issue image");

            return (
              <Fragment key={key}>
                <tr
                  className={cn(
                    "border-b align-top last:border-0",
                    hasAttention ? "bg-amber-50/30" : "",
                  )}
                >
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
                    <NetaStatusBadge equipment={record} />
                  </td>
                  <td className="px-3 py-2">{formatNumber(reportCount)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(openCases)}</td>
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
                    <td className="px-3 py-3" colSpan={7}>
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
