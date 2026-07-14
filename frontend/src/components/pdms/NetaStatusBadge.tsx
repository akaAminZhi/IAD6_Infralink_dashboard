import type { PdmEquipmentRecord } from "../../types/data";
import { hasMissingNetaReport, isNetaComplete } from "../../utils/pdmUtils";
import { StatusBadge } from "../common/StatusBadge";

interface NetaStatusBadgeProps {
  equipment: PdmEquipmentRecord;
}

export function NetaStatusBadge({ equipment }: NetaStatusBadgeProps) {
  if (hasMissingNetaReport(equipment)) {
    return <StatusBadge tone="danger">Complete, Missing Report</StatusBadge>;
  }

  if (isNetaComplete(equipment)) {
    return <StatusBadge tone="success">Complete</StatusBadge>;
  }

  return <StatusBadge tone="warning">Incomplete</StatusBadge>;
}
