import type { NetaDuplicateMatch, NetaReportManifest } from "../types/data";

export function makeDuplicate(overrides: Partial<NetaDuplicateMatch> = {}): NetaDuplicateMatch {
  const file = (number: number) => ({ name: `GC-${number}.pdf`,
    gc: { source_key: "gc", source_label: "GC", equipment_id: "EQ-1", report_name: `GC-${number}.pdf`,
      source_report_name: `Original-${number}.pdf`, relative_path: `EQ-1/GC-${number}.pdf`, url: `/gc/GC-${number}.pdf` },
    original: { source_key: "downloaded", source_label: "Original", equipment_id: "EQ-1", report_name: `Original-${number}.pdf`, url: `/original/Original-${number}.pdf` },
  });
  return { match_id: "a".repeat(64), revision: "b".repeat(64), device_name: "EQ-1", report_stage: "temporary",
    batch_id: "batch", category: "equipment", recognized_name: "same report", classification: "possible_duplicate",
    status: "confirmed", confirmation_source: "manual", confirmed_by: "operator", confirmed_at: "2026-11-06T12:00:00Z",
    can_confirm: false, can_revoke: true, problems: [], upload_action: "skip_confirmed_duplicate",
    first: file(1), second: file(2), ...overrides };
}

export function duplicateManifest(matches = [makeDuplicate()]): NetaReportManifest {
  return { duplicate_audit: { available: true, errors: [], matches },
    records: matches.flatMap((match) => [match.first.original!, match.first.gc!, match.second.original!, match.second.gc!]) };
}
