import { equipmentEnergizationReadiness, type ConnectedCableIndex } from "../../utils/connectedCables";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

export function EnergizationReadyBadge({ equipment, cableIndex }: { equipment: FlattenedEquipmentRow; cableIndex: ConnectedCableIndex | null }) {
  const { status, reason } = equipmentEnergizationReadiness(equipment, cableIndex);
  return <span title={reason}><StatusBadge tone={status === "ready" ? "success" : status === "not_ready" ? "warning" : "muted"}>
    {status === "ready" ? "Energization ready" : status === "not_ready" ? "Not ready" : status === "unknown" ? "Not confirmed" : "N/A"}
  </StatusBadge></span>;
}
