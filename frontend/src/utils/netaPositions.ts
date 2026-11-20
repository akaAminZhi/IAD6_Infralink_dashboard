import type { EquipmentBaselineFilter } from "../components/equipment/EquipmentFilters";
import type { NetaPositionCheck, NetaPositionEquipment } from "../types/netaPositions";

export type NetaPositionIndex = Map<string, NetaPositionEquipment>;

export function buildNetaPositionIndex(check: NetaPositionCheck | null): NetaPositionIndex {
  return new Map((check?.equipment ?? []).map((entry) => [entry.equipment_id.toUpperCase(), entry]));
}

export function findNetaPositionEntry(
  index: NetaPositionIndex,
  ...ids: Array<string | null | undefined>
): NetaPositionEquipment | null {
  for (const id of ids) {
    const key = String(id ?? "").trim().toUpperCase();
    if (!key) continue;
    const entry = index.get(key) ?? index.get(`IAD06-${key}`);
    if (entry) return entry;
  }
  return null;
}

export function matchesBaselineFilter(entry: NetaPositionEquipment | null, filter: EquipmentBaselineFilter): boolean {
  if (!filter) return true;
  if (!entry) return false;
  const count = (code: string) => (entry.issue_counts[code] ?? 0) > 0;
  switch (filter) {
    case "nonconforming": return entry.nonconforming;
    case "no_baseline": return entry.baseline_basis === "none";
    case "duplicate": return count("duplicate") || count("duplicate_different_sn");
    default: return count(filter);
  }
}
