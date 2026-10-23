import type { Equipment, LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest } from "../types/data";
import { visibleLayoutEquipment } from "./layoutPlanUtils";
import { placedLayoutCables } from "./layoutIsometricUtils";
import { equipmentSearchPriority, matchesSearchQuery } from "./searchUtils";

interface SearchEntry {
  id: string;
  label: string;
  key: string;
  floorId: string | null;
  floorLabel: string;
}

export type LayoutSearchEntry = SearchEntry & (
  | { kind: "placement"; record: LayoutEquipmentRecord }
  | { kind: "cable"; record: LayoutCableRecord }
  | { kind: "equipment"; record: Equipment }
);

function equipmentKey(value: string): string {
  return value.trim().toUpperCase().replace(/^IAD06-/, "");
}

export function buildLayoutSearchEntries(
  manifest: LayoutPlanManifest, equipment: Equipment[], currentFloorId: string,
): LayoutSearchEntry[] {
  const entries: LayoutSearchEntry[] = [];
  const represented = new Set<string>();
  const seenPlacements = new Set<string>();
  const placements = manifest.floors.map((floor) => {
    const records = visibleLayoutEquipment(manifest, floor.floor_id);
    const cableIds = new Set(placedLayoutCables(manifest.cables ?? [], records).map(({ cable }) => cable.cable_id));
    return { floor, records, cableIds };
  });
  for (const { floor, records } of placements) {
    for (const record of records) {
      const id = `${record.fixed ? "fixed" : floor.floor_id}:${record.equipment_key}`;
      if (seenPlacements.has(id)) continue;
      seenPlacements.add(id);
      represented.add(equipmentKey(record.matched_equipment_id ?? record.label));
      entries.push({ id, kind: "placement", record, label: record.label, key: record.equipment_key,
        floorId: record.fixed ? currentFloorId : floor.floor_id,
        floorLabel: record.fixed ? "Fixed across floors" : floor.label });
    }
  }
  for (const record of manifest.cables ?? []) {
    const available = placements.filter(({ cableIds }) => cableIds.has(record.cable_id));
    const placement = available.find(({ floor }) => floor.floor_id === currentFloorId) ?? available[0];
    const key = equipmentKey(record.cable_id);
    represented.add(key);
    entries.push({ id: `cable:${record.cable_id}`, kind: "cable", record, label: record.cable_id, key,
      floorId: placement?.floor.floor_id ?? null, floorLabel: placement ? `Cable · ${placement.floor.label}` : "Cable · Not placed on layout" });
  }
  equipment.forEach((record, index) => {
    const label = record.equipment_id?.trim();
    if (!label) return;
    const key = equipmentKey(label);
    if (represented.has(key)) return;
    entries.push({ id: `equipment:${index}`, kind: "equipment", record, label, key,
      floorId: null, floorLabel: `${record.equipment_type ?? "Equipment"} · Not placed on layout` });
  });
  return entries;
}

export function searchLayoutEntries(entries: LayoutSearchEntry[], search: string): LayoutSearchEntry[] {
  const query = equipmentKey(search);
  if (!query) return [];
  return entries.filter((entry) => matchesSearchQuery([entry.label, entry.key], query))
    .sort((a, b) => (a.kind === "cable" ? 1 : equipmentSearchPriority(a.record.equipment_type)) -
      (b.kind === "cable" ? 1 : equipmentSearchPriority(b.record.equipment_type)) ||
      Number(b.key === query) - Number(a.key === query) ||
      Number(b.key.startsWith(query)) - Number(a.key.startsWith(query)) ||
      a.label.localeCompare(b.label, undefined, { numeric: true })).slice(0, 12);
}
