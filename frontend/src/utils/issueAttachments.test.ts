import { describe, expect, it } from "vitest";

import type { IssueAttachmentManifest } from "../types/data";
import { getIssueAttachmentLinks, isImageAttachment } from "./issueAttachments";

describe("issueAttachments", () => {
  const manifest: IssueAttachmentManifest = {
    records: [
      {
        case_id: "IAD06-001",
        field: "Issue Image",
        file_name: "Issue Image-01.jpg",
        attachment_kind: "image",
        url: "/attachments/issue-01.jpg",
      },
      {
        case_id: "IAD06-001",
        field: "Issue Image",
        file_name: "Issue Image-01.jpg",
        attachment_kind: "image",
        url: "/attachments/issue-01.jpg",
      },
      {
        case_id: "IAD06-001",
        field: "Corrective Images",
        file_name: "Corrective-01.pdf",
        attachment_kind: "pdf",
        url: "/attachments/corrective-01.pdf",
      },
    ],
  };

  it("matches case, field, and filename without duplicate URLs", () => {
    expect(
      getIssueAttachmentLinks(
        manifest,
        " iad06-001 ",
        "Issue Image",
        " issue image-01.jpg ",
      ),
    ).toEqual([
      {
        attachmentKind: "image",
        field: "Issue Image",
        fileName: "Issue Image-01.jpg",
        url: "/attachments/issue-01.jpg",
      },
    ]);
  });

  it("does not mix issue and corrective attachment fields", () => {
    expect(
      getIssueAttachmentLinks(
        manifest,
        "IAD06-001",
        "Issue Image",
        "Corrective-01.pdf",
      ),
    ).toEqual([]);
    expect(getIssueAttachmentLinks(null, "IAD06-001", "Issue Image", "a.jpg")).toEqual([]);
  });

  it("recognizes manifest images and common image extensions", () => {
    expect(isImageAttachment("image", "file.bin")).toBe(true);
    expect(isImageAttachment("file", "photo.WEBP")).toBe(true);
    expect(isImageAttachment("pdf", "report.pdf")).toBe(false);
  });
});
