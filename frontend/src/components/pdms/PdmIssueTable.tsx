import type { EnrichedIssue } from "../../utils/issueUtils";
import { formatDateTime } from "../../utils/formatters";
import { EmptyState } from "../common/EmptyState";
import { CorrectiveImagesBadge } from "../issues/CorrectiveImagesBadge";
import { IssueImageBadge } from "../issues/IssueImageBadge";
import { IssueStatusBadge } from "../issues/IssueStatusBadge";

interface PdmIssueTableProps {
  issues: EnrichedIssue[];
  onSelectIssue: (issue: EnrichedIssue) => void;
  selectedIssueId: string | null;
}

export function PdmIssueTable({
  issues,
  onSelectIssue,
  selectedIssueId,
}: PdmIssueTableProps) {
  if (issues.length === 0) {
    return <EmptyState title="No issues found for this PDM." />;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Case ID</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Equipment ID</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Last Updated</th>
            <th className="px-3 py-2 font-medium">Issue Image</th>
            <th className="px-3 py-2 font-medium">Corrective Images</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const isSelected = selectedIssueId === issue.row_id;

            return (
              <tr
                className={`cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50 ${
                  isSelected ? "bg-primary/5" : ""
                }`}
                key={issue.row_id}
                onClick={() => onSelectIssue(issue)}
              >
                <td className="px-3 py-3 font-medium">{issue.case_id ?? "--"}</td>
                <td className="px-3 py-3">
                  <IssueStatusBadge status={issue.status} />
                </td>
                <td className="px-3 py-3">{issue.equipment_id ?? "--"}</td>
                <td className="max-w-[360px] whitespace-pre-wrap px-3 py-3">
                  <span className="line-clamp-3">{issue.summary ?? "--"}</span>
                </td>
                <td className="px-3 py-3">{formatDateTime(issue.created_at)}</td>
                <td className="px-3 py-3">{formatDateTime(issue.last_updated_at)}</td>
                <td className="px-3 py-3">
                  <IssueImageBadge compact issue={issue} />
                </td>
                <td className="px-3 py-3">
                  <CorrectiveImagesBadge compact issue={issue} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
