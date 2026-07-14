import type { CaseIssue } from "../../types/data";
import { getIssueImageReferences, hasIssueImage, type EnrichedIssue } from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";
import { IssueAttachmentBadge } from "./IssueAttachmentBadge";

type IssueImageSource =
  | Pick<EnrichedIssue, "case_id" | "issue_image">
  | Pick<CaseIssue, "case_id" | "issue_image">;

interface IssueImageBadgeProps {
  issue: IssueImageSource;
  compact?: boolean;
  showImageThumbnails?: boolean;
}

export function IssueImageBadge({
  issue,
  compact = false,
  showImageThumbnails = false,
}: IssueImageBadgeProps) {
  if (!hasIssueImage(issue)) {
    return <StatusBadge tone="danger">Missing Issue Image</StatusBadge>;
  }

  const references = getIssueImageReferences(issue.issue_image);
  if (compact) {
    return <StatusBadge tone="success">Available</StatusBadge>;
  }

  return (
    <IssueAttachmentBadge
      caseId={issue.case_id}
      emptyLabel="No issue image"
      field="Issue Image"
      references={references}
      showImageThumbnails={showImageThumbnails}
      tone="emerald"
    />
  );
}
