import { isClosedStatus } from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";

interface IssueStatusBadgeProps {
  status: string | null;
}

export function IssueStatusBadge({ status }: IssueStatusBadgeProps) {
  if (!status) {
    return <StatusBadge tone="muted">Unknown</StatusBadge>;
  }

  return <StatusBadge tone={isClosedStatus(status) ? "success" : "default"}>{status}</StatusBadge>;
}
