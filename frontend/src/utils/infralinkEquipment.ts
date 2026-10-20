import type { InfralinkEquipmentLink } from "../types/data";

function key(value: string): string {
  return value.trim().toUpperCase();
}

export function buildInfralinkEquipmentIndex(records: InfralinkEquipmentLink[]): Map<string, string> {
  const candidates = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record || typeof record.equipment_id !== "string" || !/^[1-9]\d*$/.test(String(record.infralink_id))) continue;
    const reference = key(record.equipment_id);
    if (!reference) continue;
    const identifiers = candidates.get(reference) ?? new Set<string>();
    identifiers.add(String(record.infralink_id));
    candidates.set(reference, identifiers);
  }
  const index = new Map<string, string>();
  for (const [reference, identifiers] of candidates) {
    if (identifiers.size === 1) {
      // The embedded Angular detail page returns Session 401 and stays blank
      // without an existing JC2 login. The main app owns sign-in and embeds the
      // same device detail after authentication (JC2's native full-page route).
      index.set(reference, `https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=${[...identifiers][0]}`);
    }
  }
  return index;
}

export function getInfralinkEquipmentUrl(index: Map<string, string>, equipmentId?: string | null): string | null {
  if (!equipmentId?.trim()) return null;
  const reference = key(equipmentId);
  // An exact source identity always wins. Do not infer cable endpoints or strip
  // circuit suffixes: those can identify separate Infralink system elements.
  return index.get(reference) ?? null;
}
