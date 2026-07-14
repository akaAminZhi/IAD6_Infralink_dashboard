import { FileSpreadsheet } from "lucide-react";

import type { EtlRunMetadata, SourceFileMap } from "../../types/data";
import { formatDateTime } from "../../utils/formatters";
import { Badge } from "../ui/badge";

interface HeaderProps {
  etlRunMetadata: EtlRunMetadata | null;
}

function getSelectedFiles(metadata: EtlRunMetadata | null): SourceFileMap {
  return metadata?.selected_input_files ?? {};
}

export function Header({ etlRunMetadata }: HeaderProps) {
  const selectedFiles = getSelectedFiles(etlRunMetadata);
  const fileEntries = Object.entries(selectedFiles).filter(([, file]) => file?.file_name);

  return (
    <header className="border-b bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal text-foreground">
            IAD06 Equipment Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PDM-centric equipment, issue, and NETA tracking
          </p>
        </div>
        {fileEntries.length > 0 ? (
          <div className="flex max-w-3xl flex-wrap gap-2">
            {fileEntries.map(([key, file]) => (
              <Badge className="gap-1.5 bg-card text-foreground" key={key}>
                <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{key.replace(/_/g, " ")}:</span>
                <span className="max-w-[260px] truncate">{file?.file_name}</span>
              </Badge>
            ))}
            {etlRunMetadata?.generated_at ? (
              <Badge>ETL {formatDateTime(etlRunMetadata.generated_at)}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
