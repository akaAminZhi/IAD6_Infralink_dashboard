import { getIssueNetaStatus, type EnrichedIssue } from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";

interface IssueEquipmentNetaBadgeProps {
  issue: EnrichedIssue;
}

export function IssueEquipmentNetaBadge({ issue }: IssueEquipmentNetaBadgeProps) {
  const status = getIssueNetaStatus(issue);
  const tone =
    status === "Complete + Report"
      ? "success"
      : status === "Complete - Missing Report"
        ? "danger"
        : status === "Unknown"
          ? "muted"
          : "warning";

  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}
