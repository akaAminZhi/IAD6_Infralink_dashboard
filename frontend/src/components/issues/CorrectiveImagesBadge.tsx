import type { CaseIssue } from "../../types/data";
import {
  getCorrectiveImageReferences,
  hasCorrectiveImages,
  isClosedStatus,
  type EnrichedIssue,
} from "../../utils/issueUtils";
import { StatusBadge } from "../common/StatusBadge";
import { IssueAttachmentBadge } from "./IssueAttachmentBadge";

type CorrectiveImagesSource =
  | Pick<EnrichedIssue, "case_id" | "corrective_images" | "status">
  | Pick<CaseIssue, "case_id" | "corrective_images" | "status">;

interface CorrectiveImagesBadgeProps {
  issue: CorrectiveImagesSource;
  compact?: boolean;
  showImageThumbnails?: boolean;
}

export function CorrectiveImagesBadge({
  issue,
  compact = false,
  showImageThumbnails = false,
}: CorrectiveImagesBadgeProps) {
  if (!hasCorrectiveImages(issue)) {
    return isClosedStatus(issue.status) ? (
      <StatusBadge tone="danger">Missing Corrective Images</StatusBadge>
    ) : (
      <StatusBadge tone="muted">No Corrective Images</StatusBadge>
    );
  }

  const references = getCorrectiveImageReferences(issue.corrective_images);
  if (compact) {
    return <StatusBadge tone="success">Available</StatusBadge>;
  }

  return (
    <IssueAttachmentBadge
      caseId={issue.case_id}
      emptyLabel="No corrective images"
      field="Corrective Images"
      references={references}
      showImageThumbnails={showImageThumbnails}
      tone="blue"
    />
  );
}
