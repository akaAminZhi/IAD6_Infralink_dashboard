import { isHighPriorityIssue, isUrgentIssue } from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";

interface IssuePriorityBadgeProps {
  priority: string | null;
}

export function IssuePriorityBadge({ priority }: IssuePriorityBadgeProps) {
  if (!priority) {
    return <StatusBadge tone="muted">Unknown</StatusBadge>;
  }

  const issue = { priority };
  if (isUrgentIssue(issue)) {
    return <StatusBadge tone="danger">{priority}</StatusBadge>;
  }
  if (isHighPriorityIssue(issue)) {
    return <StatusBadge tone="warning">{priority}</StatusBadge>;
  }

  return <StatusBadge tone="muted">{priority}</StatusBadge>;
}
