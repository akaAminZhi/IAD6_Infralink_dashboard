import type { PdmEquipmentRecord } from "../../types/data";
import { requiresEquipmentTestTracking } from "../../utils/equipmentTrackingUtils";
import { hasMissingNetaReport, isNetaComplete } from "../../utils/pdmUtils";
import { StatusBadge } from "../common/StatusBadge";

interface NetaStatusBadgeProps {
  equipment: PdmEquipmentRecord;
}

export function NetaStatusBadge({ equipment }: NetaStatusBadgeProps) {
  if (!requiresEquipmentTestTracking(equipment)) {
    return <StatusBadge tone="muted">Not Tracked</StatusBadge>;
  }

  if (hasMissingNetaReport(equipment)) {
    return <StatusBadge tone="danger">Complete, Missing Report</StatusBadge>;
  }

  if (isNetaComplete(equipment)) {
    return <StatusBadge tone="success">Complete</StatusBadge>;
  }

  return <StatusBadge tone="warning">Incomplete</StatusBadge>;
}
