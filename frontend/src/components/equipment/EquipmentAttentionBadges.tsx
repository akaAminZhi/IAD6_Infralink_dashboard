import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { getEquipmentAttentionReasons } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

interface EquipmentAttentionBadgesProps {
  equipment: FlattenedEquipmentRow;
}

export function EquipmentAttentionBadges({ equipment }: EquipmentAttentionBadgesProps) {
  const reasons = getEquipmentAttentionReasons(equipment);

  if (reasons.length === 0) {
    return <StatusBadge tone="success">No attention reason</StatusBadge>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <StatusBadge key={reason} tone={reason.includes("Missing") ? "danger" : "warning"}>
          {reason}
        </StatusBadge>
      ))}
    </div>
  );
}
