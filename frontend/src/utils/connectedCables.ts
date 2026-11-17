import type { LayoutCableRecord, LayoutPlanManifest, NetaReportManifest } from "../types/data";
import { hasInfralinkCableTestReport, layoutCableTestState, parseCableAttachmentNames } from "./cableTestUtils";
import { requiresEquipmentTestTracking } from "./equipmentTrackingUtils";
import { isCableEquipment, type FlattenedEquipmentRow } from "./equipmentUtils";
import { isDefaultCxalloyUploadExcluded } from "./cxalloyUploadScope";

export function connectedEquipmentKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/^IAD0?6-/, "");
}

export interface ConnectedCableIndex {
  byEquipment: Map<string, LayoutCableRecord[]>;
  reportCableIds: Set<string>;
}

/** Use all Layout connections, including unresolved and unplaced endpoints. */
export function buildConnectedCableIndex(
  layout: LayoutPlanManifest | null | undefined, reports: NetaReportManifest | null,
): ConnectedCableIndex | null {
  if (!Array.isArray(layout?.cables)) return null;
  const byEquipment = new Map<string, LayoutCableRecord[]>();
  for (const cable of layout.cables) {
    for (const key of new Set([cable.source_equipment_key, cable.target_equipment_key].map(connectedEquipmentKey).filter(Boolean))) {
      const items = byEquipment.get(key) ?? [];
      items.push(cable);
      byEquipment.set(key, items);
    }
  }
  const reportCableIds = new Set<string>();
  for (const report of reports?.records ?? []) {
    if (!report.url) continue;
    for (const name of [report.report_name, report.source_report_name]) {
      if (name) reportCableIds.add(name.trim().replace(/\.pdf$/i, "").toUpperCase());
    }
  }
  return { byEquipment, reportCableIds };
}

export function isConnectedCableExcluded(cable: LayoutCableRecord): boolean {
  return [cable.source_equipment_key, cable.target_equipment_key].some((endpoint) => {
    if (isDefaultCxalloyUploadExcluded(endpoint)) return true;
    // Additional Equipment-page scope: all AHU6, and UPS6 outside the first R zone.
    const match = /^(AHU6|UPS6)(?:-(.*))?$/.exec(connectedEquipmentKey(endpoint));
    if (!match) return false;
    if (match[1] === "AHU6") return true;
    const zone = (match[2] ?? "").replace(/^-+/, "").split("-", 1)[0];
    return !/^\d*R$/.test(zone);
  });
}

export function getConnectedCableScope(equipment: FlattenedEquipmentRow, index: ConnectedCableIndex | null) {
  const allCables = index?.byEquipment.get(connectedEquipmentKey(equipment.equipment_id ?? equipment.display_equipment_id)) ?? [];
  const cables = allCables.filter((cable) => !isConnectedCableExcluded(cable));
  return { cables, excludedCount: allCables.length - cables.length };
}

export function getConnectedCables(equipment: FlattenedEquipmentRow, index: ConnectedCableIndex | null): LayoutCableRecord[] {
  return getConnectedCableScope(equipment, index).cables;
}

export function cableHasReport(cable: LayoutCableRecord, index: ConnectedCableIndex): boolean {
  return hasInfralinkCableTestReport(cable) || parseCableAttachmentNames(cable.neta_test_report).length > 0 ||
    index.reportCableIds.has(cable.cable_id.trim().toUpperCase());
}

export function connectedCableCounts(cables: LayoutCableRecord[], index: ConnectedCableIndex) {
  const counts = { total: 0, tested: 0, failed: 0, unconfirmed: 0, withReport: 0, ready: 0 };
  for (const cable of cables) {
    if (isConnectedCableExcluded(cable)) continue;
    counts.total += 1;
    const state = layoutCableTestState(cable);
    const tested = state === "updated" || state === "pending";
    const report = cableHasReport(cable, index);
    if (tested) counts.tested += 1;
    else if (state === "failed") counts.failed += 1;
    else counts.unconfirmed += 1;
    if (report) counts.withReport += 1;
    if (tested && report) counts.ready += 1;
  }
  return counts;
}

export type EnergizationReadiness = "ready" | "not_ready" | "unknown" | "not_applicable";

export function equipmentEnergizationReadiness(equipment: FlattenedEquipmentRow, index: ConnectedCableIndex | null): {
  status: EnergizationReadiness; reason: string;
} {
  if (!requiresEquipmentTestTracking(equipment) || isCableEquipment(equipment) || /cable|termination/i.test(equipment.equipment_type ?? "")) {
    return { status: "not_applicable", reason: "Energization readiness applies to tracked equipment." };
  }
  if (equipment.neta_complete !== true) return { status: "not_ready", reason: "Equipment NETA completion is not confirmed." };
  if (!index) return { status: "unknown", reason: "Connected cable data is unavailable." };
  const { cables, excludedCount } = getConnectedCableScope(equipment, index);
  if (!cables.length && !excludedCount) return { status: "unknown", reason: "No connected cables found; cable scope is not confirmed." };
  if (!cables.length) return { status: "ready", reason: "NETA complete; all connected cables are excluded by the cable scope rules." };
  const counts = connectedCableCounts(cables, index);
  return counts.ready === counts.total
    ? { status: "ready", reason: `NETA complete; all ${counts.total} connected cables tested with reports.` }
    : { status: "not_ready", reason: `${counts.ready}/${counts.total} connected cables tested with reports; ${counts.failed} failed, ${counts.unconfirmed} unconfirmed, ${counts.total - counts.withReport} missing reports.` };
}
