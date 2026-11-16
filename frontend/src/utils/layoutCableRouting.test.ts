import { describe, expect, it } from "vitest";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutRegionRecord, PowerPlanPoint } from "../types/data";
import { routeLayoutCables, routeLayoutRoomCables, routeRoomTrunks } from "./layoutCableRouting";
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

  it("runs a fanning hub's in-room feeders on one bus per device line with straight drops, keeping side-by-side single links as arcs", () => {
    // Like CDS6-01R-8: ATS-1/3/5/7 stand in one column, ATS-2/4/6/8 in another; ATS-1 also has its PDU beside it.
    const hub = device("CDS", 85, 10);
    const ats = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => device(`ATS-${n}`, n % 2 ? 50 : 65, 10 + Math.floor((n - 1) / 2) * 20));
    const pdu = device("PDU", 40, 10);
    const placed = placedLayoutCables([...ats.map((leaf) => cable("CDS", leaf.equipment_key)), cable("PDU", "ATS-1")], [hub, ...ats, pdu], [room]);
    const routed = routeRoomTrunks(placed, [room]);
    expect(routed[8]).toBe(placed[8]);
    // Routes are stored from the alphabetically first end ("ATS-*"); reverse to read from the hub:
    // [roof, rise, bus start, over device, roof].
    const routes = routed.slice(0, 8).map((c) => [...c.corridorRoute!].reverse());
    // Along a plan line at fixed x and height, screenY + screenX / 2 = x - height is constant.
    const column = (p: PowerPlanPoint) => p.y + p.x / 2;
    for (const [i, points] of routes.entries()) {
      expect(points).toHaveLength(5);
      expect(points[0]).toEqual(port(hub));
      expect(points[4]).toEqual(port(ats[i]));
      expect(points[1]).toEqual(routes[0][1]);
      // Same column -> same bus start and same bus line; the other column -> a different bus.
      const sibling = routes[i % 2], other = routes[(i + 1) % 2];
      expect(points[2]).toEqual(sibling[2]);
      expect(column(points[3])).toBeCloseTo(column(sibling[2]));
      expect(column(points[3])).not.toBeCloseTo(column(other[2]));
      expect(points[1].x).toBeCloseTo(points[0].x);
      expect(points[3].x).toBeCloseTo(points[4].x);
      expect(pathsCross(points, points)).toBe(false);
    }
    // Final routing applies the same buses and leaves the PDU-ATS pair as a direct arc.
    const final = routeLayoutCables(placed, [room], new Map());
    expect(final.slice(0, 8).map((c) => [...c.corridorRoute!].reverse())).toEqual(routes);
    expect(final[8].corridorRoute).toBeUndefined();
    expect(layoutCablePath(final[8])).toContain(" C ");
    // A hub whose only links are side by side is left alone.
    const near = [device("A", 10, 10), device("B", 20, 10), device("C", 10, 20)];
    const tight = placedLayoutCables([cable("A", "B"), cable("A", "C")], near, [room]);
    expect(routeRoomTrunks(tight, [room])).toEqual(tight);
  });

  it("sends a bus hub's cable to another room along its nearest bus at one tray height before it splits off", () => {
    const left = { ...room, annotation_id: "left", rect: { x: 0, y: 0, width: 100, height: 100 } };
    const right = { ...room, annotation_id: "right", rect: { x: 100, y: 0, width: 100, height: 100 } };
    // CDS feeds two ATS columns in its own room (x 144 and 164) and one device T in the left room.
    const hub = device("CDS", 180, 10), target = device("T", 30, 50);
    const ats = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => device(`ATS-${n}`, n % 2 ? 140 : 160, 20 + Math.floor((n - 1) / 2) * 20));
    const placed = placedLayoutCables([...ats.map((leaf) => cable("CDS", leaf.equipment_key)), cable("CDS", "T")], [hub, ...ats, target], [left, right]);
    const routed = routeLayoutCables(placed, [left, right], new Map());
    const fromHub = (i: number) => routed[i].corridorRoute![0].x === port(hub).x && routed[i].corridorRoute![0].y === port(hub).y
      ? routed[i].corridorRoute! : [...routed[i].corridorRoute!].reverse();
    // ATS-1 sits on the column nearest T. The T cable shares its hub feeder and bus start...
    const bus = fromHub(0), out = fromHub(8);
    expect(out[0]).toEqual(port(hub));
    expect(out[out.length - 1]).toEqual(port(target));
    expect(out[1]).toEqual(bus[1]);
    expect(out[2]).toEqual(bus[2]);
    // ...runs on along that same bus line (fixed plan x: screenY + screenX / 2 is constant)...
    const column = (p: PowerPlanPoint) => p.y + p.x / 2;
    expect(column(out[3])).toBeCloseTo(column(bus[3]));
    // ...and at the same height turns onto the front tray toward T (fixed plan y: screenY - screenX / 2 is constant).
    const front = (p: PowerPlanPoint) => p.y - p.x / 2;
    expect(front(out[4])).toBeCloseTo(front(out[3]));
    // One tray height throughout: the only vertical segments are the rise off the hub and the drop onto T.
    const vertical = out.slice(1).flatMap((p, i) => Math.abs(p.x - out[i].x) < 1e-9 ? [i] : []);
    expect(vertical).toEqual([0, out.length - 2]);
    expect(pathsCross(out, out)).toBe(false);
  });

  it("bundles room-to-panel feeders into one shared tray with a trunk per aligned panel column", () => {
    const hubs = [device("PDU-1", 20, 30), device("PDU-2", 60, 50)];
    const panels = [device("RPP-1", 40, -80), device("RPP-2", 41, -50), device("RPP-3", 80, -60)];
    const cables = [cable("PDU-1", "RPP-1"), cable("PDU-2", "RPP-2"), cable("PDU-1", "RPP-3")];
    const placed = placedLayoutCables(cables, [...hubs, ...panels], [room]);
    expect(placed.every((c) => c.roomToOverhead)).toBe(true);
    const routed = routeLayoutCables(placed, [room], new Map());
    const routes = routed.map((c) => c.corridorRoute!);
    expect(routes.every(Boolean)).toBe(true);
    for (const [index, c] of routed.entries()) {
      const [a, b] = [c.source, c.target].sort((x, y) => x.equipment_key.localeCompare(y.equipment_key));
      expect(routes[index][0]).toEqual(port(a));
      expect(routes[index][routes[index].length - 1]).toEqual(port(b));
      expect(pathsCross(routes[index], routes[index])).toBe(false);
    }
    // Indoor endpoints sort first ("PDU" < "RPP"): [roof, rise, edge, trunk start, trunk end, over panel, panel roof].
    const [first, second, third] = routes;
    expect(first[2].y - first[2].x * 0.5).toBeCloseTo(second[2].y - second[2].x * 0.5);
    expect(first[3]).toEqual(second[3]);
    expect(third[3]).not.toEqual(first[3]);
    expect(first[1].y - first[1].x * 0.5 - (third[1].y - third[1].x * 0.5)).toBeCloseTo(0);
  });

  it("runs feeders between rooms on one shared front tray and drops each onto its device", () => {
    const left = { ...room, annotation_id: "left", rect: { x: 0, y: 0, width: 100, height: 100 } };
    const right = { ...room, annotation_id: "right", rect: { x: 100, y: 0, width: 100, height: 100 } };
    const rows = [device("A-1", 20, 30), device("A-2", 60, 70), device("B-1", 130, 20), device("B-2", 170, 60)];
    const placed = placedLayoutCables([cable("A-1", "B-1"), cable("A-2", "B-2"), cable("A-1", "B-2")], rows, [left, right]);
    const routed = routeLayoutCables(placed, [left, right], new Map());
    // Along a plan run at fixed y and height, screenY - screenX / 2 = y - height is constant.
    const line = (p: PowerPlanPoint) => p.y - p.x / 2;
    const shared = line(routed[0].corridorRoute![2]);
    for (const c of routed) {
      const points = c.corridorRoute!;
      expect(points).toBeDefined();
      expect(points[0]).toEqual(port(c.source));
      expect(points[points.length - 1]).toEqual(port(c.target));
      expect(pathsCross(points, points)).toBe(false);
      // [roof, rise, front tray start, front tray end, over device, roof]: one front tray for all.
      expect(points).toHaveLength(6);
      expect(line(points[2])).toBeCloseTo(shared);
      expect(line(points[3])).toBeCloseTo(shared);
      // Straight vertical rise off the source roof and straight drop onto the target roof.
      expect(points[1].x).toBeCloseTo(points[0].x);
      expect(points[4].x).toBeCloseTo(points[5].x);
    }
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
