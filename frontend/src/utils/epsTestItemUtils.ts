import type { EpsTestItemRecord } from "../types/data";

export type EpsEquipmentStatus =
  | "Passed"
  | "Fixed"
  | "Failed"
  | "In Progress"
  | "Not Started"
  | "No Test Items";

export interface EpsTestItemSummary {
  total: number;
  passed: number;
  fixed: number;
  failed: number;
  remaining: number;
  status: EpsEquipmentStatus;
}

export function normalizeEpsEquipmentKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^IAD06-/, "");
}

function getItemModuleKeys(item: EpsTestItemRecord): string[] {
  return Array.from(
    new Set(
      [item.matched_equipment_id, item.module_equipment_key, item.module_equipment]
        .map(normalizeEpsEquipmentKey)
        .filter(Boolean),
    ),
  );
}

export function buildEpsTestItemIndex(
  items: EpsTestItemRecord[],
): Map<string, EpsTestItemRecord[]> {
  const index = new Map<string, EpsTestItemRecord[]>();

  items.forEach((item) => {
    getItemModuleKeys(item).forEach((key) => {
      const records = index.get(key) ?? [];
      records.push(item);
      index.set(key, records);
    });
  });

  return index;
}

export function getIndexedEpsTestItems(
  index: Map<string, EpsTestItemRecord[]>,
  equipmentIdentifiers: unknown[],
): EpsTestItemRecord[] {
  const records: EpsTestItemRecord[] = [];
  const seen = new Set<EpsTestItemRecord>();

  Array.from(
    new Set(equipmentIdentifiers.map(normalizeEpsEquipmentKey).filter(Boolean)),
  ).forEach((key) => {
    (index.get(key) ?? []).forEach((item) => {
      if (!seen.has(item)) {
        seen.add(item);
        records.push(item);
      }
    });
  });

  return records;
}

function normalizedItemStatus(item: EpsTestItemRecord): string {
  return String(item.item_status ?? item.status ?? "").trim().toLowerCase();
}

export function summarizeEpsTestItems(items: EpsTestItemRecord[]): EpsTestItemSummary {
  const passed = items.filter((item) => normalizedItemStatus(item).startsWith("passed")).length;
  const fixed = items.filter((item) => normalizedItemStatus(item).startsWith("fixed")).length;
  const failed = items.filter((item) => normalizedItemStatus(item).startsWith("failed")).length;
  const remaining = Math.max(0, items.length - passed - fixed - failed);

  let status: EpsEquipmentStatus = "No Test Items";
  if (failed > 0) {
    status = "Failed";
  } else if (remaining > 0 && passed + fixed > 0) {
    status = "In Progress";
  } else if (remaining > 0) {
    status = "Not Started";
  } else if (fixed > 0 && passed === 0) {
    status = "Fixed";
  } else if (items.length > 0) {
    status = "Passed";
  }

  return {
    total: items.length,
    passed,
    fixed,
    failed,
    remaining,
    status,
  };
}

export function getEpsStatusTone(
  status: EpsEquipmentStatus,
): "success" | "warning" | "danger" | "muted" {
  if (status === "Passed" || status === "Fixed") return "success";
  if (status === "Failed") return "danger";
  if (status === "In Progress" || status === "Not Started") return "warning";
  return "muted";
}
