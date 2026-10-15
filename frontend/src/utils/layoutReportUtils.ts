import type { LayoutCableRecord, NetaReportManifest } from "../types/data";
import { getNetaReportNames, sortNetaReportNames } from "./netaReports";

/** GC cable PDFs are filed under endpoint equipment, so their filenames identify the cable. */
export function getLayoutCableReportNames(
  cable: Pick<LayoutCableRecord, "cable_id" | "neta_test_report" | "feeder_cable_atp_files">,
  manifest: NetaReportManifest | null,
): string[] {
  const names = new Map<string, string>();
  const linkedAtpNames = new Set((cable.feeder_cable_atp_files ?? []).map((file) => file.file_name.trim().toLowerCase()));
  for (const name of getNetaReportNames(cable.neta_test_report)) {
    if (!linkedAtpNames.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  const cableId = cable.cable_id.trim().toLowerCase();
  for (const record of manifest?.records ?? []) {
    if (!record.url) continue;
    const match = [record.report_name, record.source_report_name].find((name) =>
      name?.trim().replace(/\.pdf$/i, "").toLowerCase() === cableId);
    if (match && !linkedAtpNames.has(match.trim().toLowerCase())) {
      names.set(match.trim().toLowerCase(), match.trim());
    }
  }
  return sortNetaReportNames([...names.values()]);
}
