import { formatNumber } from "../../utils/formatters";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

export function CxalloyUploadBadge({ equipment }: { equipment: FlattenedEquipmentRow }) {
  const reports = equipment.cxalloy_reports;
  if (reports != null) {
    if (reports.length === 0) {
      return <span className="text-muted-foreground">No report files</span>;
    }

    const statuses = [
      { status: "uploaded", label: "Uploaded", tone: "success" },
      { status: "pending", label: "Pending", tone: "warning" },
      { status: "review_required", label: "Review required", tone: "warning" },
      { status: "missing_pdf", label: "Missing local PDF", tone: "danger" },
    ] as const;

    return (
      <div className="flex flex-col items-start gap-1">
        {statuses.map(({ status, label, tone }) => {
          const matching = reports.filter((report) => report.upload_status === status);
          if (matching.length === 0) return null;
          const equipmentCount = matching.filter((report) => report.report_kind === "equipment").length;
          const cableCount = matching.length - equipmentCount;
          return (
            <span key={status} title={`${label}: ${formatNumber(equipmentCount)} equipment reports, ${formatNumber(cableCount)} cable reports`}>
              <StatusBadge tone={tone}>
                {`${label} · ${formatNumber(matching.length)} ${matching.length === 1 ? "file" : "files"}`}
              </StatusBadge>
            </span>
          );
        })}
      </div>
    );
  }

  // Legacy manifests have no per-file evidence for a pending count.
  if (equipment.cxalloy_upload_status === "uploaded") {
    return <StatusBadge tone="success">Uploaded</StatusBadge>;
  }
  if (equipment.cxalloy_upload_status === "missing_pdf") {
    return <StatusBadge tone="danger">Missing local PDF</StatusBadge>;
  }
  if (equipment.cxalloy_upload_status === "pending") {
    return <StatusBadge tone="warning">Pending</StatusBadge>;
  }

  return <span className="text-muted-foreground">--</span>;
}
