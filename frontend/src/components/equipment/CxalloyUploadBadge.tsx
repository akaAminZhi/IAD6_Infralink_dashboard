import { formatNumber } from "../../utils/formatters";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

export function CxalloyUploadBadge({ equipment }: { equipment: FlattenedEquipmentRow }) {
  const count = formatNumber(equipment.cxalloy_expected_report_count);

  if (equipment.cxalloy_upload_status === "uploaded") {
    return <StatusBadge tone="success">{`Uploaded · ${count} files`}</StatusBadge>;
  }
  if (equipment.cxalloy_upload_status === "missing_pdf") {
    return <StatusBadge tone="danger">Missing local PDF</StatusBadge>;
  }
  if (equipment.cxalloy_upload_status === "pending") {
    return <StatusBadge tone="warning">{`Pending · ${count} files`}</StatusBadge>;
  }

  return <span className="text-muted-foreground">--</span>;
}
