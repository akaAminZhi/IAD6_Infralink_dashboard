import { FileText } from "lucide-react";
import { formatDateTime } from "../../utils/formatters";
import { Button } from "../ui/button";

export const DAILY_REPORT_PAGE_SIZE = 5;

interface ReportRow {
  report_name: string;
  modified_at: string;
  counts: {
    failed: number;
    retested_and_passed: number;
    tested?: number;
    tested_and_passed?: number;
  };
}

interface DailyReportTableProps<T extends ReportRow> {
  reports: readonly T[];
  emptyMessage: string;
  disabled: boolean;
  onEdit: (report: T) => void;
  reportKind?: "eps" | "mv";
}

export function DailyReportTable<T extends ReportRow>({
  reports, emptyMessage, disabled, onEdit, reportKind = "eps",
}: DailyReportTableProps<T>) {
  const failed = { key: "failed", label: "Failed", tone: "text-red-700" } as const;
  const retested = { key: "retested_and_passed", label: "Retested + Passed", tone: "text-teal-700" } as const;
  const tested = { key: "tested", label: reportKind === "mv" ? "Tested + Passed" : "Tested", tone: "text-emerald-700" } as const;
  const columns = reportKind === "mv" ? [tested, failed, retested] : [failed, retested, tested];
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1024px] table-fixed text-left text-sm">
      <colgroup>
        <col className="w-[15%]" /><col className="w-[10%]" /><col className="w-[22%]" />
        <col className="w-[13%]" /><col className="w-[28%]" /><col className="w-[12%]" />
      </colgroup>
      <thead className="border-b bg-muted/35 text-xs uppercase text-muted-foreground">
        <tr>
          <th className="px-5 py-3 font-medium">Report</th>
          {columns.map((column) => <th className="px-4 py-3 font-medium" key={column.key}>{column.label}</th>)}
          <th className="px-4 py-3 font-medium">Modified</th>
          <th className="px-5 py-3 text-right font-medium">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {reports.map((report) => <tr key={report.report_name}>
          <td className="px-5 py-3 font-semibold">{report.report_name}</td>
          {columns.map((column) => <td className={`px-4 py-3 ${column.tone}`} key={column.key}>
            {column.key === "tested" ? report.counts.tested ?? report.counts.tested_and_passed ?? 0 : report.counts[column.key]}
          </td>)}
          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(report.modified_at)}</td>
          <td className="px-5 py-3 text-right">
            <Button disabled={disabled} onClick={() => onEdit(report)} variant="ghost">
              <FileText className="mr-2 h-4 w-4" /> Edit
            </Button>
          </td>
        </tr>)}
        {reports.length === 0 && <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>{emptyMessage}</td></tr>}
      </tbody>
    </table>
  </div>;
}
