import type { CxalloyEquipmentLink } from "../types/data";

function key(value: string): string {
  return value.trim().toUpperCase();
}

export function buildCxalloyEquipmentIndex(records: CxalloyEquipmentLink[]): Map<string, string> {
  const candidates = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record || typeof record.equipment_id !== "string"
      || !/^[1-9]\d*$/.test(String(record.project_id))
      || !/^[1-9]\d*$/.test(String(record.cxalloy_id))) continue;
    const reference = key(record.equipment_id);
    if (!reference) continue;
    const urls = candidates.get(reference) ?? new Set<string>();
    urls.add(`https://tq.cxalloy.com/project/${record.project_id}/equipment/${record.cxalloy_id}`);
    candidates.set(reference, urls);
  }
  const index = new Map<string, string>();
  for (const [reference, urls] of candidates) {
    if (urls.size === 1) index.set(reference, [...urls][0]);
  }
  return index;
}

export function getCxalloyEquipmentUrl(index: Map<string, string>, equipmentId?: string | null): string | null {
  // All website aliases are resolved by the builder; never infer cable endpoints here.
  return equipmentId?.trim() ? index.get(key(equipmentId)) ?? null : null;
}
