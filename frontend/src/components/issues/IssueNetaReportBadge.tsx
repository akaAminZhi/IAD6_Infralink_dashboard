import {
  getNetaReportReferences,
  getIssueNetaStatus,
  hasMissingNetaReportForIssue,
  type EnrichedIssue,
} from "../../utils/issueUtils";
import type { NetaReportNameMode } from "../../utils/netaReports";
import { NetaReportChips } from "../common/NetaReportChips";
import { StatusBadge } from "../common/StatusBadge";

interface IssueNetaReportBadgeProps {
  issue: EnrichedIssue;
  compactNameMode?: NetaReportNameMode;
  compact?: boolean;
  showLinkedFileNames?: boolean;
}

export function IssueNetaReportBadge({
  issue,
  compactNameMode = "original",
  compact = false,
  showLinkedFileNames = false,
}: IssueNetaReportBadgeProps) {
  const references = getNetaReportReferences(issue.neta_test_report);

  if (hasMissingNetaReportForIssue(issue)) {
    return <StatusBadge tone="danger">Missing Report</StatusBadge>;
  }

  if (references.length === 0) {
    return <span className="text-muted-foreground">{getIssueNetaStatus(issue) === "Incomplete" ? "Not Complete" : "--"}</span>;
  }

  if (compact) {
    return <StatusBadge tone="success">Available</StatusBadge>;
  }

  return (
    <NetaReportChips
      compactNameMode={compactNameMode}
      reports={references}
      showLinkedFileNames={showLinkedFileNames}
    />
  );
}
