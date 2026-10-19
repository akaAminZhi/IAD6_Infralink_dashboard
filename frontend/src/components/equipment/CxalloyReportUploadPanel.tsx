import type { CxalloyReportFileStatus } from "../../types/data";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { StatusBadge } from "../common/StatusBadge";

type FileStatus = CxalloyReportFileStatus["upload_status"];

function UploadStatus({ status }: { status: FileStatus }) {
  if (status === "uploaded") return <StatusBadge tone="success">Uploaded</StatusBadge>;
  if (status === "missing_pdf") return <StatusBadge tone="danger">Missing local PDF</StatusBadge>;
  if (status === "review_required") return <StatusBadge tone="warning">Review required</StatusBadge>;
  return <StatusBadge tone="warning">Pending</StatusBadge>;
}

function equipmentStatus(reports: CxalloyReportFileStatus[]): FileStatus {
  if (reports.some((report) => report.upload_status === "missing_pdf")) return "missing_pdf";
  if (reports.some((report) => report.upload_status === "review_required")) return "review_required";
  return reports.every((report) => report.upload_status === "uploaded") ? "uploaded" : "pending";
}

function ReportList({ reports }: { reports: CxalloyReportFileStatus[] }) {
  return (
    <ul className="divide-y rounded-md border bg-background">
      {reports.map((report) => (
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2" key={report.report_name}>
          <span className="min-w-0 flex-1 break-all text-xs">{report.report_name}</span>
          <span className="shrink-0"><UploadStatus status={report.upload_status} /></span>
        </li>
      ))}
    </ul>
  );
}

export function CxalloyReportUploadPanel({ equipment }: { equipment: FlattenedEquipmentRow }) {
  const reports = equipment.cxalloy_reports;
  const equipmentReports = reports?.filter((report) => report.report_kind === "equipment") ?? [];
  const cableReports = reports?.filter((report) => report.report_kind === "cable") ?? [];
  const status = equipmentStatus(equipmentReports);

  return (
    <section aria-label="CxAlloy Report Upload" className="space-y-3 border-t pt-4">
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">CxAlloy Report Upload</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload status for downloaded reports. Equipment and cable reports are tracked separately.
        </p>
      </div>
      {reports == null ? (
        <p className="text-sm text-muted-foreground">Refresh report status data to show equipment and cable uploads separately.</p>
      ) : (
        <>
          <section aria-label="Equipment Reports" className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Equipment Reports</h4>
              {equipmentReports.length > 0 ? <UploadStatus status={status} /> : null}
            </div>
            {equipmentReports.length > 0 ? (
              <details key={`${equipment.row_id}-${status}`} open={status !== "uploaded"}>
                <summary className="cursor-pointer text-xs text-muted-foreground">Equipment report files</summary>
                <div className="mt-2"><ReportList reports={equipmentReports} /></div>
              </details>
            ) : <p className="text-xs text-muted-foreground">No downloaded equipment reports.</p>}
          </section>
          <section aria-label="Cable Reports" className="space-y-3 rounded-md border bg-muted/20 p-3">
            <h4 className="text-sm font-medium">Cable Reports</h4>
            <p className="text-xs text-muted-foreground">Only downloaded cable reports are listed; this does not indicate that all cable reports are available.</p>
            {cableReports.length > 0 ? <ReportList reports={cableReports} /> : (
              <p className="text-xs text-muted-foreground">No downloaded cable reports.</p>
            )}
          </section>
        </>
      )}
      {reports?.some((report) => report.upload_status === "review_required") ? (
        <p className="text-xs text-amber-800">Review required: a report's current contents could not be verified against successful upload records.</p>
      ) : null}
      {equipment.cxalloy_last_attempt_error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span className="font-medium">Last upload attempt: </span>{equipment.cxalloy_last_attempt_error}
        </div>
      ) : null}
    </section>
  );
}
