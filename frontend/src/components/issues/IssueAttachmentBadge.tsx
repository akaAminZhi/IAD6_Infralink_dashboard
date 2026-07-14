import { X } from "lucide-react";
import { useState } from "react";

import { useIssueAttachmentManifest } from "../../contexts/IssueAttachmentManifestContext";
import {
  getIssueAttachmentLinks,
  isImageAttachment,
  type IssueAttachmentField,
  type IssueAttachmentLink,
} from "../../utils/issueAttachments";
import { isBlank } from "../../utils/issueUtils";

interface IssueAttachmentBadgeProps {
  caseId?: string | null;
  emptyLabel: string;
  field: IssueAttachmentField;
  references: string[];
  showImageThumbnails?: boolean;
  tone?: "emerald" | "blue";
}

interface AttachmentPreview {
  displayName: string;
  link: IssueAttachmentLink;
}

const toneClasses = {
  emerald: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  },
  blue: {
    chip: "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100",
  },
};

function AttachmentPreviewModal({
  onClose,
  preview,
}: {
  onClose: () => void;
  preview: AttachmentPreview | null;
}) {
  if (!preview) {
    return null;
  }

  const { link } = preview;
  const isImage = isImageAttachment(link.attachmentKind, link.fileName);

  return (
    <div className="fixed inset-0 z-[80]" onClick={(event) => event.stopPropagation()}>
      <button
        aria-label="Close issue attachment preview overlay"
        className="absolute inset-0 bg-black/35"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        type="button"
      />
      <section
        className="absolute inset-3 flex flex-col overflow-hidden rounded-md border bg-background shadow-2xl md:inset-6"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b bg-card p-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {link.field}
            </div>
            <h2 className="mt-1 break-words text-base font-semibold tracking-normal">
              {link.fileName}
            </h2>
          </div>
          <button
            aria-label="Close issue attachment preview"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            type="button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        {isImage ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
            <img
              alt={link.fileName}
              className="max-h-full max-w-full object-contain"
              src={link.url}
            />
          </div>
        ) : (
          <iframe
            className="h-full w-full flex-1 bg-white"
            src={link.url}
            title={link.fileName}
          />
        )}
      </section>
    </div>
  );
}

export function IssueAttachmentBadge({
  caseId,
  emptyLabel,
  field,
  references,
  showImageThumbnails = false,
  tone = "blue",
}: IssueAttachmentBadgeProps) {
  const manifest = useIssueAttachmentManifest();
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const classes = toneClasses[tone];

  if (references.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {references.map((reference, index) => {
          const links = getIssueAttachmentLinks(manifest, caseId, field, reference);
          const link = links[0] ?? null;

          if (!link && /^https?:\/\//i.test(reference)) {
            return (
              <button
                className={`rounded-md border px-3 py-2 text-left text-sm underline-offset-4 ${classes.chip}`}
                key={`${reference}-${index}`}
                onClick={() =>
                  setPreview({
                    displayName: reference,
                    link: {
                      attachmentKind: "file",
                      field,
                      fileName: reference,
                      url: reference,
                    },
                  })
                }
                type="button"
              >
                {reference}
              </button>
            );
          }

          if (link) {
            const isImage = isImageAttachment(link.attachmentKind, link.fileName);

            return showImageThumbnails && isImage ? (
              <button
                className="w-[180px] overflow-hidden rounded-md border bg-card text-left shadow-sm transition hover:border-primary/50 hover:bg-muted/30"
                key={`${reference}-${index}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPreview({ displayName: reference, link });
                }}
                title={link.fileName}
                type="button"
              >
                <div className="h-28 w-full bg-slate-100">
                  <img
                    alt={link.fileName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={link.url}
                  />
                </div>
                <div className="line-clamp-2 px-2 py-2 text-xs font-medium text-foreground">
                  {link.fileName}
                </div>
              </button>
            ) : (
              <button
                className={`rounded-md border px-3 py-2 text-left text-sm underline-offset-4 ${classes.chip}`}
                key={`${reference}-${index}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPreview({ displayName: reference, link });
                }}
                title={link.fileName}
                type="button"
              >
                {link.fileName}
              </button>
            );
          }

          return (
            <span
              className={`rounded-md border px-3 py-2 text-sm ${classes.chip}`}
              key={`${reference}-${index}`}
              title={isBlank(caseId) ? "Missing case ID for local file lookup" : undefined}
            >
              {reference}
            </span>
          );
        })}
      </div>
      <AttachmentPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}
