import type { LayoutEquipmentRecord, LayoutPlanManifest, LayoutRegionRecord, PowerPlanRect } from "../types/data";

export type LayoutStatus = "notEnergized" | "energizeToday" | "energized" | "unknown";
export const LAYOUT_STATUS_LABELS: Record<LayoutStatus, string> = {
  notEnergized: "Not Energized",
  energizeToday: "Energize today",
  energized: "Energized",
  unknown: "Unknown",
};
export const LAYOUT_STATUS_COLORS: Record<LayoutStatus, { fill: string; stroke: string }> = {
  notEnergized: { fill: "#e2e8f0", stroke: "#64748b" },
  energizeToday: { fill: "#ffedd5", stroke: "#f97316" },
  energized: { fill: "#f87171", stroke: "#b91c1c" },
  unknown: { fill: "#f8fafc", stroke: "#94a3b8" },
};
export const LAYOUT_OVERRIDES_KEY = "iad6-layout-status-overrides-v1";

export function baselineLayoutStatus(record: LayoutEquipmentRecord): LayoutStatus {
  if (record.match_status !== "matched") return "unknown";
  return record.energized_completed_at ? "energized" : "notEnergized";
}

export function layoutEquipmentStatus(record: LayoutEquipmentRecord, overrides: Record<string, LayoutStatus>): LayoutStatus {
  const baseline = baselineLayoutStatus(record);
  // Confirmed energisation takes priority over a previously saved planning flag.
  return baseline === "energized" ? baseline : overrides[record.equipment_key] ?? baseline;
}

export function readLayoutOverrides(): Record<string, LayoutStatus> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LAYOUT_OVERRIDES_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, status]) =>
      typeof status === "string" && Object.prototype.hasOwnProperty.call(LAYOUT_STATUS_LABELS, status),
    )) as Record<string, LayoutStatus>;
  } catch {
    return {};
  }
}

export function visibleLayoutEquipment(manifest: LayoutPlanManifest, floorId: string): LayoutEquipmentRecord[] {
  const fixedSources = new Map<string, string>();
  manifest.fixed_equipment.forEach((record) => {
    if (!fixedSources.has(record.equipment_key)) fixedSources.set(record.equipment_key, record.source_floor_id);
  });
  // A PDF can show the same equipment ID in several distinct rectangles.
  // Keep all those placements from its first fixed source floor.
  const fixed = manifest.fixed_equipment.filter((record) =>
    fixedSources.get(record.equipment_key) === record.source_floor_id,
  );
  return [
    ...(manifest.floors.find((floor) => floor.floor_id === floorId)?.equipment ?? [])
      .filter((record) => !fixedSources.has(record.equipment_key)),
    ...fixed,
  ];
}

export function visibleLayoutRegions(manifest: LayoutPlanManifest, floorId: string): LayoutRegionRecord[] {
  const signature = (region: LayoutRegionRecord) => `${region.kind}:${region.label.toUpperCase()}:${JSON.stringify(region.rect)}`;
  const sources = new Map<string, string>();
  for (const region of manifest.fixed_regions ?? []) {
    if (!sources.has(signature(region))) sources.set(signature(region), region.source_floor_id);
  }
  return [
    ...(manifest.floors.find((floor) => floor.floor_id === floorId)?.regions ?? []).filter((region) => !sources.has(signature(region))),
    ...(manifest.fixed_regions ?? []).filter((region) => sources.get(signature(region)) === region.source_floor_id),
  ];
}

export function insetEquipmentRect(rect: PowerPlanRect): PowerPlanRect {
  // Keep annotation centers; a bounded inset separates even tiny adjacent devices.
  const inset = Math.min(0.8, rect.width * 0.12, rect.height * 0.12);
  return { x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 };
}

export function layoutRoomLabels(regions: LayoutRegionRecord[]) {
  return regions.filter((region) => region.kind === "room").map((region) => {
    const fontSize = Math.min(4.5, (region.rect.width - 4) / (region.label.length * 0.65 + 1), region.rect.height / 8);
    const width = region.label.length * fontSize * 0.65 + fontSize;
    const rect = { x: region.rect.x + (region.rect.width - width) / 2, y: region.rect.y + 2, width, height: fontSize + 2 };
    return { region, rect, fontSize };
  });
}

export function layoutSelectionRect(start: { x: number; y: number }, end: { x: number; y: number }): PowerPlanRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function equipmentInLayoutSelection(records: LayoutEquipmentRecord[], selection: PowerPlanRect): Set<string> {
  return new Set(records.filter((record) => {
    const rect = insetEquipmentRect(record.rect);
    return rect.x >= selection.x && rect.y >= selection.y &&
      rect.x + rect.width <= selection.x + selection.width && rect.y + rect.height <= selection.y + selection.height;
  }).map((record) => record.equipment_key));
}

export function planLayoutSelection(
  records: LayoutEquipmentRecord[], selection: ReadonlySet<string>, overrides: Record<string, LayoutStatus>,
): Record<string, LayoutStatus> {
  const next = { ...overrides };
  for (const record of records) {
    if (selection.has(record.equipment_key) && layoutEquipmentStatus(record, overrides) !== "energized") {
      next[record.equipment_key] = "energizeToday";
    }
  }
  return next;
}

export function zoomLayoutViewport(
  viewport: PowerPlanRect, fullBounds: PowerPlanRect, factor: number,
  anchor = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 },
): PowerPlanRect {
  const width = Math.min(fullBounds.width * 2, Math.max(fullBounds.width * 0.02, viewport.width * factor));
  const scale = width / viewport.width;
  return {
    x: anchor.x - (anchor.x - viewport.x) * scale,
    y: anchor.y - (anchor.y - viewport.y) * scale,
    width, height: viewport.height * scale,
  };
}

export function layoutCanvasPoint(
  viewport: PowerPlanRect, bounds: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number,
): { x: number; y: number } {
  const scale = Math.max(Number.EPSILON, Math.min(bounds.width / viewport.width, bounds.height / viewport.height));
  return {
    x: viewport.x + (clientX - bounds.left - (bounds.width - viewport.width * scale) / 2) / scale,
    y: viewport.y + (clientY - bounds.top - (bounds.height - viewport.height * scale) / 2) / scale,
  };
}

export function layoutBounds(records: { rect: PowerPlanRect }[]): PowerPlanRect {
  if (!records.length) return { x: 0, y: 0, width: 100, height: 100 };
  const padding = 15;
  const x = Math.min(...records.map((record) => record.rect.x)) - padding;
  const y = Math.min(...records.map((record) => record.rect.y)) - padding;
  return {
    x, y,
    width: Math.max(...records.map((record) => record.rect.x + record.rect.width)) - x + padding,
    height: Math.max(...records.map((record) => record.rect.y + record.rect.height)) - y + padding,
  };
}
