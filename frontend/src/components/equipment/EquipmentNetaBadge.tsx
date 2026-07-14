import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { getNetaDisplayStatus } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

interface EquipmentNetaBadgeProps {
  equipment: FlattenedEquipmentRow;
}

export function EquipmentNetaBadge({ equipment }: EquipmentNetaBadgeProps) {
  const status = getNetaDisplayStatus(equipment);
  const tone =
    status === "Complete + Report Available"
      ? "success"
      : status === "Complete - Missing Report"
        ? "danger"
        : status === "Unknown"
          ? "muted"
          : "warning";

  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}
