import type { NetaDuplicateMatch, NetaReportManifest } from "../types/data";

const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export function getEquipmentDuplicates(manifest: NetaReportManifest | null, equipmentId?: string | null) {
  if (!equipmentId || !manifest?.duplicate_audit?.available) return [];
  return manifest.duplicate_audit.matches.filter((match) => key(match.device_name) === key(equipmentId) ||
    // Shared cable PDFs may be stored under an endpoint equipment directory.
    (match.category === "cable" && [match.first, match.second].some((file) =>
      key(file.original?.report_name ?? file.gc?.source_report_name).replace(/\.pdf$/, "") === key(equipmentId))),
  );
}

export function getReportDuplicates(manifest: NetaReportManifest | null, equipmentId: string | null | undefined, reportName: string) {
  return getEquipmentDuplicates(manifest, equipmentId).filter((match) =>
    [match.first, match.second].some((file) =>
      [file.name, file.gc?.report_name, file.gc?.source_report_name, file.original?.report_name]
        .some((name) => key(name) === key(reportName)),
    ),
  );
}

export function duplicateLabel(match: NetaDuplicateMatch) {
  return match.status === "confirmed" ? "Confirmed Duplicate" : match.status === "possible" ? "Possible Duplicate" : "Duplicate Evidence Invalid";
}

export function duplicateCounts(matches: NetaDuplicateMatch[]) {
  const groups = [...new Map(matches.map((match) => [match.match_id, match])).values()];
  return { possible: groups.filter((m) => m.status === "possible").length,
    confirmed: groups.filter((m) => m.status === "confirmed").length,
    invalid: groups.filter((m) => m.status === "invalid").length };
}
