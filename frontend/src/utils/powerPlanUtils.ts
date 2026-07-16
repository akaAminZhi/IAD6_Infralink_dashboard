import type {
  CaseIssue,
  DashboardData,
  Equipment,
  EpsTestItemRecord,
  PdmRecord,
  PowerPlanAnnotation,
  PowerPlanRect,
} from "../types/data";
import { isOpenIssue } from "./issueUtils";

export type PowerPlanEquipmentStatus = "action" | "testing" | "ready" | "noData";

export interface EnrichedPowerPlanEquipment {
  annotation: PowerPlanAnnotation;
  equipment: Equipment | null;
  equipmentId: string;
  pdmName: string | null;
  issues: CaseIssue[];
  openIssues: CaseIssue[];
  testItems: EpsTestItemRecord[];
  passedCount: number;
  failedCount: number;
  notTestedCount: number;
  waivedCount: number;
  status: PowerPlanEquipmentStatus;
}

export const POWER_PLAN_STATUS_LABELS: Record<PowerPlanEquipmentStatus, string> = {
  action: "Open Case",
  testing: "Testing Incomplete",
  ready: "Ready",
  noData: "No EPS Data",
};

export const POWER_PLAN_STATUS_COLORS: Record<
  PowerPlanEquipmentStatus,
  { fill: string; stroke: string; text: string }
> = {
  action: { fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" },
  testing: { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  ready: { fill: "#d1fae5", stroke: "#059669", text: "#065f46" },
  noData: { fill: "#e2e8f0", stroke: "#64748b", text: "#334155" },
};

export function normalizePowerPlanEquipmentKey(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  return normalized.startsWith("IAD06-") ? normalized.slice(6) : normalized;
}

function buildEquipmentIndex(equipment: Equipment[]): Map<string, Equipment> {
  const index = new Map<string, Equipment>();
  equipment.forEach((record) => {
    const key = normalizePowerPlanEquipmentKey(record.equipment_id);
    if (key && !index.has(key)) {
      index.set(key, record);
    }
  });
  return index;
}

function buildPdmIndex(pdms: PdmRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  pdms.forEach((pdm) => {
    (pdm.equipment ?? []).forEach((equipment) => {
      [equipment.equipment_id, equipment.source_equipment_label].forEach((value) => {
        const key = normalizePowerPlanEquipmentKey(value);
        if (key && !index.has(key)) {
          index.set(key, String(pdm.pdm_name ?? "").trim());
        }
      });
    });
  });
  return index;
}

function isFailedItem(item: EpsTestItemRecord): boolean {
  return String(item.item_status ?? "").toLowerCase().startsWith("failed");
}

function isPassedItem(item: EpsTestItemRecord): boolean {
  const status = String(item.item_status ?? "").toLowerCase();
  return status.startsWith("passed") || status.startsWith("fixed");
}

function isIncompleteItem(item: EpsTestItemRecord): boolean {
  const status = String(item.item_status ?? "").trim().toLowerCase();
  return status === "not tested" || status === "incomplete";
}

export function isPowerPlanWaivedItem(
  item: EpsTestItemRecord,
  netaComplete: boolean,
): boolean {
  return (
    netaComplete &&
    isIncompleteItem(item) &&
    String(item.comments ?? "").trim().length > 0
  );
}

function getStatus(
  testItems: EpsTestItemRecord[],
  openIssues: CaseIssue[],
  netaComplete: boolean,
): PowerPlanEquipmentStatus {
  if (netaComplete) {
    return "ready";
  }
  if (openIssues.length > 0) {
    return "action";
  }
  if (testItems.length === 0) {
    return "noData";
  }
  return "testing";
}

function summarizeTestItems(
  testItems: EpsTestItemRecord[],
  netaComplete: boolean,
): Pick<
  EnrichedPowerPlanEquipment,
  "passedCount" | "failedCount" | "notTestedCount" | "waivedCount"
> {
  return {
    passedCount: testItems.filter(isPassedItem).length,
    failedCount: testItems.filter(isFailedItem).length,
    notTestedCount: testItems.filter(
      (item) =>
        !isPassedItem(item) &&
        !isFailedItem(item) &&
        !isPowerPlanWaivedItem(item, netaComplete),
    ).length,
    waivedCount: testItems.filter((item) => isPowerPlanWaivedItem(item, netaComplete))
      .length,
  };
}

export function enrichPowerPlanEquipment(
  annotations: PowerPlanAnnotation[],
  data: DashboardData,
): EnrichedPowerPlanEquipment[] {
  const equipmentIndex = buildEquipmentIndex(data.equipment);
  const pdmIndex = buildPdmIndex(data.pdms);

  return annotations
    .filter((annotation) => annotation.kind === "equipment")
    .map((annotation) => {
      const key = normalizePowerPlanEquipmentKey(
        annotation.matched_equipment_id || annotation.label,
      );
      const equipment = equipmentIndex.get(key) ?? null;
      const issues = data.cases.filter(
        (issue) =>
          normalizePowerPlanEquipmentKey(issue.equipment_id || issue.system_element_raw) === key,
      );
      const openIssues = issues.filter(isOpenIssue);
      const testItems = data.epsTestItems.filter(
        (item) => normalizePowerPlanEquipmentKey(item.module_equipment) === key,
      );
      const netaComplete = equipment?.neta_complete === true;

      return {
        annotation,
        equipment,
        equipmentId:
          String(annotation.matched_equipment_id || equipment?.equipment_id || annotation.label),
        pdmName: pdmIndex.get(key) || null,
        issues,
        openIssues,
        testItems,
        ...summarizeTestItems(testItems, netaComplete),
        status: getStatus(testItems, openIssues, netaComplete),
      };
    })
    .sort((a, b) => {
      const statusOrder: Record<PowerPlanEquipmentStatus, number> = {
        action: 0,
        testing: 1,
        ready: 2,
        noData: 3,
      };
      return statusOrder[a.status] - statusOrder[b.status] || a.equipmentId.localeCompare(b.equipmentId);
    });
}

export function enrichPdmSchematicEquipment(
  data: DashboardData,
): EnrichedPowerPlanEquipment[] {
  const equipmentIndex = buildEquipmentIndex(data.equipment);
  const issueIndex = new Map<string, CaseIssue[]>();
  const testItemIndex = new Map<string, EpsTestItemRecord[]>();

  data.cases.forEach((issue) => {
    const key = normalizePowerPlanEquipmentKey(issue.equipment_id || issue.system_element_raw);
    if (!key) return;
    const issues = issueIndex.get(key) ?? [];
    issues.push(issue);
    issueIndex.set(key, issues);
  });
  data.epsTestItems.forEach((item) => {
    const key = normalizePowerPlanEquipmentKey(item.module_equipment);
    if (!key) return;
    const items = testItemIndex.get(key) ?? [];
    items.push(item);
    testItemIndex.set(key, items);
  });

  const seen = new Set<string>();
  const rows: EnrichedPowerPlanEquipment[] = [];
  data.pdms.forEach((pdm) => {
    const pdmName = String(pdm.pdm_name ?? "").trim() || "Unassigned PDM";
    (pdm.equipment ?? []).forEach((pdmEquipment, index) => {
      const rawEquipmentId = String(
        pdmEquipment.equipment_id || pdmEquipment.source_equipment_label || "",
      ).trim();
      const key = normalizePowerPlanEquipmentKey(rawEquipmentId);
      if (!key || seen.has(`${pdmName}|${key}`)) return;
      seen.add(`${pdmName}|${key}`);

      const equipment = equipmentIndex.get(key) ?? null;
      const issues = issueIndex.get(key) ?? [];
      const openIssues = issues.filter(isOpenIssue);
      const testItems = testItemIndex.get(key) ?? [];
      const netaComplete = equipment?.neta_complete === true;
      const label = rawEquipmentId.replace(/^IAD06-/i, "");
      rows.push({
        annotation: {
          annotation_id: `pdm:${pdmName}:${key}:${index}`,
          kind: "equipment",
          label,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          center: { x: 0, y: 0 },
          normalized_equipment_key: key,
          matched_equipment_id: equipment?.equipment_id ?? pdmEquipment.equipment_id ?? null,
          match_status: pdmEquipment.match_status ?? null,
        },
        equipment,
        equipmentId: String(equipment?.equipment_id || rawEquipmentId),
        pdmName,
        issues,
        openIssues,
        testItems,
        ...summarizeTestItems(testItems, netaComplete),
        status: getStatus(testItems, openIssues, netaComplete),
      });
    });
  });

  const statusOrder: Record<PowerPlanEquipmentStatus, number> = {
    action: 0,
    testing: 1,
    ready: 2,
    noData: 3,
  };
  return rows.sort(
    (a, b) =>
      String(a.pdmName).localeCompare(String(b.pdmName), undefined, { numeric: true }) ||
      statusOrder[a.status] - statusOrder[b.status] ||
      a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true }),
  );
}

export function getAnnotationBounds(
  annotations: PowerPlanAnnotation[],
  pageWidth: number,
  pageHeight: number,
  padding = 120,
): PowerPlanRect {
  if (annotations.length === 0) {
    return { x: 0, y: 0, width: pageWidth, height: pageHeight };
  }

  const x0 = Math.max(0, Math.min(...annotations.map((item) => item.rect.x)) - padding);
  const y0 = Math.max(0, Math.min(...annotations.map((item) => item.rect.y)) - padding);
  const x1 = Math.min(
    pageWidth,
    Math.max(...annotations.map((item) => item.rect.x + item.rect.width)) + padding,
  );
  const y1 = Math.min(
    pageHeight,
    Math.max(...annotations.map((item) => item.rect.y + item.rect.height)) + padding,
  );

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
