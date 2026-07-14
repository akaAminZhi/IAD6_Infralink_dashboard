import type { IssueDueState } from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";

interface IssueDueStateBadgeProps {
  dueState: IssueDueState;
}

const toneByDueState: Record<IssueDueState, "danger" | "warning" | "muted" | "success" | "default"> = {
  Overdue: "danger",
  "Due Soon": "warning",
  "No Due Date": "muted",
  Normal: "default",
  Closed: "success",
};

export function IssueDueStateBadge({ dueState }: IssueDueStateBadgeProps) {
  return <StatusBadge tone={toneByDueState[dueState]}>{dueState}</StatusBadge>;
}
