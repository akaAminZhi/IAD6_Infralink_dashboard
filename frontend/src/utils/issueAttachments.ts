import type { IssueAttachmentFileRecord, IssueAttachmentManifest } from "../types/data";

export type IssueAttachmentField = "Issue Image" | "Corrective Images";

export interface IssueAttachmentLink {
  attachmentKind: string;
  field: IssueAttachmentField;
  fileName: string;
  url: string;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function recordMatches(
  record: IssueAttachmentFileRecord,
  caseId: string,
  field: IssueAttachmentField,
  fileName: string,
): boolean {
  return (
    normalizeKey(record.case_id) === normalizeKey(caseId) &&
    normalizeKey(record.field) === normalizeKey(field) &&
    normalizeKey(record.file_name) === normalizeKey(fileName)
  );
}

export function getIssueAttachmentLinks(
  manifest: IssueAttachmentManifest | null,
  caseId: string | null | undefined,
  field: IssueAttachmentField,
  fileName: string,
): IssueAttachmentLink[] {
  if (!manifest?.records?.length || !caseId || !fileName.trim()) {
    return [];
  }

  const seenUrls = new Set<string>();
  return manifest.records
    .filter((record) => record.url && recordMatches(record, caseId, field, fileName))
    .flatMap((record) => {
      const url = String(record.url ?? "").trim();
      if (!url || seenUrls.has(url)) {
        return [];
      }
      seenUrls.add(url);
      return [
        {
          attachmentKind: String(record.attachment_kind ?? "file"),
          field,
          fileName: String(record.file_name ?? fileName),
          url,
        },
      ];
    });
}

export function isImageAttachment(attachmentKind: string, fileName: string): boolean {
  if (attachmentKind === "image") {
    return true;
  }
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(fileName);
}
