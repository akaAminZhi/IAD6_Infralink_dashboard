import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { isBlank } from "../../utils/equipmentUtils";
import { EmptyState } from "../common/EmptyState";

interface EquipmentPdmAssociationsProps {
  rows: FlattenedEquipmentRow[];
}

export function EquipmentPdmAssociations({ rows }: EquipmentPdmAssociationsProps) {
  const associations = rows.filter((row) => !isBlank(row.pdm_name));

  if (associations.length === 0) {
    return <EmptyState title="No PDM association found." />;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {associations.map((row) => (
        <div className="rounded-md border bg-background p-3" key={row.row_id}>
          <div className="break-words text-sm font-medium">{row.pdm_name}</div>
        </div>
      ))}
    </div>
  );
}
