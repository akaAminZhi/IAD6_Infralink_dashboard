import { X } from "lucide-react";
import { useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { cn } from "../../utils/cn";
import {
  getNetaReportLinks,
  type NetaReportLink,
  type NetaReportNameMode,
} from "../../utils/netaReports";

interface NetaReportChipsProps {
  reports: string[];
  className?: string;
  compactNameMode?: NetaReportNameMode;
  showLinkedFileNames?: boolean;
}

interface ReportPreview {
  displayName: string;
  fileName: string;
  sourceLabel: string;
  url: string;
}

function makePreview(reportName: string, link: NetaReportLink): ReportPreview {
  return {
    displayName: reportName,
    fileName: link.fileName,
    sourceLabel: link.sourceLabel,
    url: link.url,
  };
}

function ReportPreviewModal({
  preview,
  onClose,
}: {
  preview: ReportPreview | null;
  onClose: () => void;
}) {
  if (!preview) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80]" onClick={(event) => event.stopPropagation()}>
      <button
        aria-label="Close NETA report preview overlay"
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
              {preview.sourceLabel}
            </div>
            <h2 className="mt-1 break-words text-base font-semibold tracking-normal">
              {preview.fileName}
            </h2>
            {preview.displayName !== preview.fileName ? (
              <div className="mt-1 break-words text-xs text-muted-foreground">
                {preview.displayName}
              </div>
            ) : null}
          </div>
          <button
            aria-label="Close NETA report preview"
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
        <iframe
          className="h-full w-full flex-1 bg-white"
          src={preview.url}
          title={preview.fileName}
        />
      </section>
    </div>
  );
}

export function NetaReportChips({
  reports,
  className,
  compactNameMode = "original",
  showLinkedFileNames = false,
}: NetaReportChipsProps) {
  const manifest = useNetaReportManifest();
  const [preview, setPreview] = useState<ReportPreview | null>(null);

  if (reports.length === 0) {
    return <span className="text-sm text-muted-foreground">--</span>;
  }

  return (
    <>
      <div
        className={cn(
          showLinkedFileNames
            ? "grid gap-2 lg:grid-cols-2"
            : "flex w-full flex-wrap gap-2 overflow-x-auto",
          className,
        )}
      >
        {reports.map((reportName, index) => {
          const links = getNetaReportLinks(reportName, manifest);
          const originalLink = links.find((link) => link.sourceKey === "downloaded") ?? null;
          const gcLink = links.find((link) => link.sourceKey === "gc") ?? null;

          if (showLinkedFileNames) {
            const displayLink =
              compactNameMode === "gc" ? gcLink ?? originalLink : originalLink ?? gcLink;
            const displayName =
              compactNameMode === "gc" ? gcLink?.fileName ?? reportName : reportName;

            return (
              <div
                className="max-w-full overflow-hidden rounded-md border border-blue-200 bg-blue-50 text-xs text-blue-950 shadow-sm"
                key={`${reportName}-${index}`}
              >
                {displayLink ? (
                  <button
                    className="block w-full break-all px-3 py-2 text-left font-semibold underline-offset-4 hover:bg-blue-100 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPreview(makePreview(reportName, displayLink));
                    }}
                    title={displayLink.fileName}
                    type="button"
                  >
                    {displayName}
                  </button>
                ) : (
                  <div className="break-all px-3 py-2 font-semibold">{displayName}</div>
                )}
                {!displayLink ? (
                  <div className="border-t border-blue-200 bg-white/70 px-3 py-2 text-muted-foreground">
                    No local PDF link found.
                  </div>
                ) : null}
              </div>
            );
          }

          const compactLink = compactNameMode === "gc" ? gcLink ?? originalLink : originalLink ?? gcLink;
          const compactDisplayName =
            compactNameMode === "gc" ? gcLink?.fileName ?? reportName : reportName;

          return (
            <span
              className="inline-flex w-full max-w-full flex-wrap items-center overflow-hidden rounded-md border border-blue-200 bg-blue-50 text-xs font-medium leading-5 text-blue-950 shadow-sm"
              key={`${reportName}-${index}`}
              title={compactDisplayName}
            >
              {compactLink ? (
                <button
                  className="min-w-0 flex-1 truncate px-2.5 py-1 text-left underline-offset-4 hover:bg-blue-100 hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreview(makePreview(reportName, compactLink));
                  }}
                  title={compactLink.fileName}
                  type="button"
                >
                  {compactDisplayName}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate px-2.5 py-1">{compactDisplayName}</span>
              )}
            </span>
          );
        })}
      </div>
      <ReportPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}
