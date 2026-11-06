import { describe, expect, it } from "vitest";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutRegionRecord, PowerPlanPoint } from "../types/data";
import { routeLayoutCables, routeLayoutRoomCables } from "./layoutCableRouting";
import { layoutCableMarkerPoint, layoutCablePath, layoutConnectionBounds, layoutDeviceHeight, placedLayoutCables, projectLayoutPoint } from "./layoutIsometricUtils";

const device = (key: string, x: number, y: number, floor = "first", fixed = false): LayoutEquipmentRecord => ({
  annotation_id: `${floor}:${key}`, equipment_key: key, label: key, source_floor_id: floor, fixed,
  rect: { x, y, width: 8, height: 6 }, match_status: "matched", matched_equipment_id: key,
  candidate_equipment_ids: [], energized_completed_at: null, system_element_status: null,
});
const room: LayoutRegionRecord = { annotation_id: "room", label: "Room", kind: "room", source_floor_id: "first", fixed: false,
  rect: { x: 0, y: 0, width: 100, height: 100 } };
const cable = (a: string, b: string): LayoutCableRecord => ({ cable_id: `${a}-${b}`, source_equipment_key: a, target_equipment_key: b,
  equipment_type: "Feeder Cable - LV", connection_status: "resolved", neta_complete: false, neta_test_report: null,
  system_element_status: null, mv_daily_test_date: null, mv_daily_test_status: null });
const port = (row: LayoutEquipmentRecord) => projectLayoutPoint(row.rect.x + row.rect.width / 2, row.rect.y + row.rect.height / 2, layoutDeviceHeight(row));
const cross = (a: PowerPlanPoint, b: PowerPlanPoint, c: PowerPlanPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const pathsCross = (a: PowerPlanPoint[], b: PowerPlanPoint[]) => a.slice(1).some((end, i) => b.slice(1).some((other, j) =>
  cross(a[i], end, b[j]) * cross(a[i], end, other) < -1e-7 && cross(b[j], other, a[i]) * cross(b[j], other, end) < -1e-7));

describe("fixed equipment cable routing", () => {
  it("routes a room fan in separated grid-aligned aisles without self crossings or crossed sibling branches", () => {
    const hub = device("HUB", 12, 86), leaves = [18, 38, 58, 78].map((y, i) => device(`LEAF-${i}`, 42, y));
    const original = placedLayoutCables(leaves.map((leaf) => cable(hub.equipment_key, leaf.equipment_key)), [hub, ...leaves], [room]);
    const before = JSON.stringify(original);
    const routed = routeLayoutRoomCables(original, [room]);
    expect(JSON.stringify(original)).toBe(before);
    const paths = routed.map((c) => c.corridorRoute!);
    expect(paths.every(Boolean)).toBe(true);
    for (const [index, connection] of routed.entries()) {
      const points = paths[index];
      expect(pathsCross(points, points)).toBe(false);
      for (let j = index + 1; j < paths.length; j++) expect(pathsCross(points, paths[j])).toBe(false);
      const [a, b] = [connection.source, connection.target].sort((a, b) => a.equipment_key.localeCompare(b.equipment_key));
      expect(points[0]).toEqual(port(a));
      expect(points[points.length - 1]).toEqual(port(b));
      expect(layoutCablePath(connection)).toContain(" Q ");
      expect(layoutCablePath(connection)).not.toContain(" C ");
      const extent = layoutConnectionBounds(connection), marker = layoutCableMarkerPoint(connection);
      for (const p of [...points, marker]) {
        expect(p.x).toBeGreaterThanOrEqual(extent.x - 1e-7);
        expect(p.x).toBeLessThanOrEqual(extent.x + extent.width + 1e-7);
        expect(p.y).toBeGreaterThanOrEqual(extent.y - 1e-7);
        expect(p.y).toBeLessThanOrEqual(extent.y + extent.height + 1e-7);
      }
    }
    const reverse = original.slice().reverse().map((c) => ({ ...c, source: c.target, target: c.source }));
    expect(routeLayoutRoomCables(reverse, [room]).map((c) => layoutCablePath(c)).reverse()).toEqual(routed.map((c) => layoutCablePath(c)));
  });

  it("preserves outdoor, buried and unclassified connections instead of inventing room membership", () => {
    const rows = [device("A", 8, 10), device("B", 40, 20), device("F", 40, 140, "first", true)];
    const original = placedLayoutCables([cable("A", "B"), cable("A", "F"), { ...cable("B", "A"), equipment_type: "Feeder Cable - MV" }], rows, [room]);
    expect(routeLayoutRoomCables(original, [])).toBe(original);
    expect(routeLayoutRoomCables(original, [room])).toBe(original);
  });

  it("keeps all outdoor-to-upper-floor feeders orthogonal with correct ports and vertical cross-floor risers", () => {
    const outdoor = device("F", 15, 130, "first", true);
    const upstairs = { ...room, annotation_id: "upper-room", source_floor_id: "second", rect: { ...room.rect, x: -160, y: -160 } };
    const leaves = [device("A", -148, -140, "second"), device("B", -115, -90, "second")];
    const connections = placedLayoutCables(leaves.map((leaf) => cable("F", leaf.equipment_key)), [outdoor, ...leaves], [upstairs])
      .map((c) => ({ ...c, externalKind: "shared-feed" as const }));
    const routed = routeLayoutCables(connections, [upstairs], new Map([["first", 0], ["second", -160]]));
    for (const c of routed) {
      expect(c.externalRoute?.hubEquipmentKey).toBe("F");
      const points = c.externalRoute!.points, trunk = c.externalRoute!.trunk;
      expect(trunk[2].x).toBe(trunk[3].x);
      expect(Math.abs(trunk[2].y - trunk[3].y)).toBe(160);
      expect(pathsCross(points, points)).toBe(false);
      expect(layoutCablePath(c)).not.toContain(" C ");
      const [a, b] = [c.source, c.target].sort((a, b) => a.equipment_key.localeCompare(b.equipment_key));
      expect(points[0]).toEqual(port(a));
      expect(points[points.length - 1]).toEqual(port(b));
    }
    expect(routed[0].externalRoute!.points).not.toEqual(routed[1].externalRoute!.points);
  });
});
