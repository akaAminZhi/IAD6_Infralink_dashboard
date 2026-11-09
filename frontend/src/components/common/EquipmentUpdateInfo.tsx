import { formatDateTime } from "../../utils/formatters";

interface EquipmentUpdateInfoProps {
  updated_by?: string | null;
  updated_at?: string | null;
}

export function EquipmentUpdateInfo({ updated_by, updated_at }: EquipmentUpdateInfoProps) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-md border bg-background p-3 text-xs" aria-label="System Elements update">
      <div className="min-w-0">
        <dt className="font-medium text-muted-foreground">Updated By</dt>
        <dd className="mt-1 break-words font-medium">{updated_by?.trim() || "--"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-muted-foreground">Updated At</dt>
        <dd className="mt-1 break-words font-medium">{updated_at?.trim() ? formatDateTime(updated_at) : "--"}</dd>
      </div>
    </dl>
  );
}
