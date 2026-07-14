import type { CaseIssue } from "../../types/data";
import { formatDateTime } from "../../utils/formatters";
import { EmptyState } from "../common/EmptyState";
import { CorrectiveImagesBadge } from "../issues/CorrectiveImagesBadge";
import { IssueImageBadge } from "../issues/IssueImageBadge";

interface EquipmentCaseListProps {
  cases: CaseIssue[];
}

export function EquipmentCaseList({ cases }: EquipmentCaseListProps) {
  if (cases.length === 0) {
    return <EmptyState title="No related cases." />;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1080px] text-left text-xs">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Case ID</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Assigned To</th>
            <th className="px-3 py-2 font-medium">Due Date</th>
            <th className="px-3 py-2 font-medium">Reported On</th>
            <th className="px-3 py-2 font-medium">Last Updated</th>
            <th className="px-3 py-2 font-medium">Issue Image</th>
            <th className="px-3 py-2 font-medium">Corrective Images</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((caseItem, index) => {
            return (
              <tr className="border-b align-top last:border-0" key={`${caseItem.case_id}-${index}`}>
                <td className="px-3 py-2 font-medium">{caseItem.case_id ?? "--"}</td>
                <td className="px-3 py-2">{caseItem.status ?? "--"}</td>
                <td className="px-3 py-2">{caseItem.priority ?? "--"}</td>
                <td className="max-w-[320px] whitespace-pre-wrap px-3 py-2">
                  {caseItem.summary ?? "--"}
                </td>
                <td className="px-3 py-2">{caseItem.assigned_to ?? "--"}</td>
                <td className="px-3 py-2">{formatDateTime(caseItem.due_date)}</td>
                <td className="px-3 py-2">{formatDateTime(caseItem.reported_on)}</td>
                <td className="px-3 py-2">{formatDateTime(caseItem.last_updated_at)}</td>
                <td className="px-3 py-2">
                  <IssueImageBadge issue={caseItem} />
                </td>
                <td className="px-3 py-2">
                  <CorrectiveImagesBadge issue={caseItem} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
