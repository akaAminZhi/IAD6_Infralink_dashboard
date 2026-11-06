import { useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { getNetaReportNames, hasGcNetaReportLinks, type NetaReportNameMode } from "../../utils/netaReports";
import { NetaReportChips } from "./NetaReportChips";
import { NetaDuplicatePanel } from "./NetaDuplicatePanel";

export function NetaReportSection({ equipmentId, value }: {
  equipmentId?: string | null;
  value?: string | null;
}) {
  const reports = getNetaReportNames(value);
  const manifest = useNetaReportManifest(reports.length > 0);
  const [nameMode, setNameMode] = useState<NetaReportNameMode>("original");
  if (!reports.length) return null;
  return (
    <section className="space-y-2" aria-label="NETA test reports">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">NETA Test Reports</h3>
        {hasGcNetaReportLinks(reports, manifest, equipmentId) ? (
          <button className="text-xs font-medium text-primary hover:underline" type="button"
            onClick={() => setNameMode(nameMode === "original" ? "gc" : "original")}>
            {nameMode === "original" ? "Show GC report names" : "Show original report names"}
          </button>
        ) : null}
      </div>
      <NetaReportChips equipmentId={equipmentId} reports={reports} compactNameMode={nameMode} showLinkedFileNames stackedCompact />
      <NetaDuplicatePanel equipmentId={equipmentId} />
    </section>
  );
}
