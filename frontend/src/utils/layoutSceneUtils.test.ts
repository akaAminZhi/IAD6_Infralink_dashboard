import { describe, expect, it } from "vitest";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest, LayoutRegionRecord } from "../types/data";
import { layoutCableLanes, layoutCableMarkerPoint, layoutCablePath, layoutConnectionBounds, layoutDeviceHeight,
  overheadCablePoints, placedLayoutCables, projectLayoutPoint } from "./layoutIsometricUtils";
import { buildCombinedLayoutScene } from "./layoutSceneUtils";

const device = (key: string, floor: string, x: number, y: number, fixed = false): LayoutEquipmentRecord => ({
  annotation_id: `${floor}:${key}`, equipment_key: key, label: key, source_floor_id: floor, fixed,
  rect: { x, y, width: 10, height: 8 }, match_status: "matched", matched_equipment_id: key,
  candidate_equipment_ids: [], energized_completed_at: null, system_element_status: null,
});
const cable = (a: string, b: string): LayoutCableRecord => ({ cable_id: `${a}-${b}`, source_equipment_key: a, target_equipment_key: b,
  equipment_type: "Feeder Cable - LV", connection_status: "resolved", neta_complete: false, neta_test_report: null,
  system_element_status: null, mv_daily_test_date: null, mv_daily_test_status: null });

function manifest(): LayoutPlanManifest {
  const room = (floor: string): LayoutRegionRecord => ({ annotation_id: `${floor}:room`, label: floor, source_floor_id: floor,
    fixed: false, kind: "room", rect: { x: 0, y: 100, width: 200, height: 60 } });
  return { generated_at: "2026-11-03", selected_input_files: {}, diagnostics: [], fixed_equipment: [device("F", "first", 250, 200, true)],
    floors: [
      { floor_id: "first", label: "First Floor", page_number: 1, file_name: "floor.pdf", width: 400, height: 300,
        equipment: [device("A", "first", 10, 120), device("U", "first", 80, 20)], regions: [room("first")] },
      { floor_id: "second", label: "Second Floor", page_number: 2, file_name: "floor.pdf", width: 400, height: 300,
        equipment: [device("B", "second", 10, 120), device("V", "second", 80, 20)], regions: [room("second")] },
    ], cables: [cable("A", "U"), cable("B", "V"), cable("F", "A"), cable("F", "B"), cable("A", "B"), cable("B", "U")] };
}

describe("combined Layout scene", () => {
  it("covers both complete floor inventories with aligned decks and excludes shared outdoor equipment", () => {
    const scene = buildCombinedLayoutScene(manifest());
    const decks = scene.groups.filter((group) => group.groundRect);
    expect(decks).toHaveLength(2);
    expect(scene.groups.find((group) => group.id === "shared")!.groundRect).toBeUndefined();
    const [first, second] = decks.map((group) => group.groundRect!);
    expect(first.width).toBe(second.width);
    expect(first.height).toBe(second.height);
    expect(projectLayoutPoint(first.x, first.y).x).toBe(projectLayoutPoint(second.x, second.y).x);
    expect(projectLayoutPoint(first.x, first.y).y - projectLayoutPoint(second.x, second.y).y).toBe(scene.floorLift);
    for (const group of decks) {
      const ground = group.groundRect!;
      for (const row of scene.rows.filter((item) => !item.fixed && item.source_floor_id === group.id)) {
        expect(row.rect.x).toBeGreaterThanOrEqual(ground.x);
        expect(row.rect.y).toBeGreaterThanOrEqual(ground.y);
        expect(row.rect.x + row.rect.width).toBeLessThanOrEqual(ground.x + ground.width);
        expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(ground.y + ground.height);
      }
    }
    expect(first.y + first.height).toBeLessThan(scene.rows.find((row) => row.fixed)!.rect.y);
  });

  it("uses a compact room-based lift, allows overlapping floor extents and keeps the shared group unchanged", () => {
    const data = manifest(), before = JSON.stringify(data);
    const scene = buildCombinedLayoutScene(data);
    const [first, second, shared] = scene.groups;
    expect(first.offsetY).toBe(0);
    expect(shared.offsetY).toBe(0);
    expect(first.offsetY - second.offsetY).toBe(scene.floorLift);
    expect(scene.floorLift).toBeLessThan(second.rect.height);
    expect(second.rect.y + second.rect.height).toBeGreaterThan(first.rect.y);
    expect(scene.rows).toHaveLength(5);
    expect(scene.rows.filter((row) => row.fixed)).toEqual(data.fixed_equipment);
    const b = scene.rows.find((row) => row.equipment_key === "B")!;
    const original = data.floors[1].equipment[0];
    const display = projectLayoutPoint(b.rect.x, b.rect.y), source = projectLayoutPoint(original.rect.x, original.rect.y);
    expect(display.x).toBeCloseTo(source.x);
    expect(display.y - source.y).toBeCloseTo(second.offsetY);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("translates same-floor geometry exactly and retains the first floor's shared feeder", () => {
    const data = manifest(), scene = buildCombinedLayoutScene(data);
    const floor = data.floors[1], offset = scene.groups[1].offsetY;
    const original = placedLayoutCables(data.cables!, floor.equipment, floor.regions);
    const lanes = layoutCableLanes(original);
    const connection = scene.connections.find(({ cable: record }) => record.cable_id === "B-V")!;
    const displayed = overheadCablePoints(connection, layoutCableLanes(scene.connections)[scene.connections.indexOf(connection)]);
    overheadCablePoints(original[0], lanes[0]).forEach((point, i) => {
      expect(displayed[i].x).toBeCloseTo(point.x);
      expect(displayed[i].y).toBeCloseTo(point.y + offset);
    });
    const originalShared = placedLayoutCables(data.cables!, [...data.floors[0].equipment, ...data.fixed_equipment], data.floors[0].regions)
      .find(({ cable: record }) => record.cable_id === "F-A")!;
    expect(scene.geometry.find(({ connection: item }) => item.cable.cable_id === "F-A")!.path).toBe(layoutCablePath(originalShared));
  });

  it("routes cross-floor links near room edges with accurate roof ports, warnings and fit bounds", () => {
    const scene = buildCombinedLayoutScene(manifest());
    expect(scene.connections).toHaveLength(6);
    expect(scene.connections.filter((item) => item.externalKind === "cross-floor")).toHaveLength(2);
    expect(scene.connections.filter((item) => item.externalKind === "shared-feed")).toHaveLength(1);
    for (const connection of scene.connections.filter((item) => item.externalRoute)) {
      const points = overheadCablePoints(connection), trunk = connection.externalRoute!.trunk, riser = trunk[2];
      expect(riser.x).toBe(trunk[3].x);
      expect(Math.abs(riser.y - trunk[3].y)).toBeCloseTo(scene.floorLift);
      const [a, b] = [connection.source, connection.target].sort((x, y) => x.equipment_key.localeCompare(y.equipment_key));
      const port = (row: LayoutEquipmentRecord) => projectLayoutPoint(row.rect.x + row.rect.width / 2, row.rect.y + row.rect.height / 2, layoutDeviceHeight(row));
      expect(points[0]).toEqual(port(a));
      expect(points[points.length - 1]).toEqual(port(b));
      const hub = connection.source.equipment_key === connection.externalRoute!.hubEquipmentKey ? connection.source : connection.target;
      const sourceRoom = scene.regions.find((region) => region.source_floor_id === hub.source_floor_id)!;
      const height = layoutDeviceHeight(hub) + trunk[0].y - trunk[1].y;
      expect(riser.y + height - riser.x / 2).toBeLessThan(sourceRoom.rect.y);
      expect(riser.x).toBeGreaterThan(scene.contentBounds.x);
      expect(riser.x).toBeLessThan(scene.contentBounds.x + scene.contentBounds.width);
      expect(layoutCablePath(connection)).not.toContain(" C ");
      const bounds = layoutConnectionBounds(connection), marker = layoutCableMarkerPoint(connection);
      for (const point of [...points, marker]) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.x - 1e-8);
        expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-8);
        expect(point.y).toBeGreaterThanOrEqual(bounds.y - 1e-8);
        expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-8);
      }
      const liesOnRun = points.slice(2, -1).some((end, i) => {
        const start = points[i + 1];
        return Math.abs(Math.hypot(marker.x - start.x, marker.y - start.y) + Math.hypot(marker.x - end.x, marker.y - end.y)
          - Math.hypot(end.x - start.x, end.y - start.y)) < 1e-7;
      });
      expect(liesOnRun).toBe(true);
    }
  });

  it("gives MDB6-01R's two ATS-TX-INV6 feeders the same trunk and distinct destination branches", () => {
    const data = manifest();
    data.floors[0].equipment = [device("ATS-TX-INV6-01R", "first", 180, 120), device("ATS-TX-INV6-02R", "first", 10, 120)];
    data.floors[1].equipment = [device("MDB6-01R", "second", 180, 120)];
    data.cables = data.floors[0].equipment.map((row) => ({ ...cable("MDB6-01R", row.equipment_key),
      cable_id: `FDR-IAD06-MDB6-01R-IAD06-${row.equipment_key}` }));
    const scene = buildCombinedLayoutScene(data);
    const [a, b] = scene.connections;
    expect(a.externalRoute!.hubEquipmentKey).toBe("MDB6-01R");
    expect(b.externalRoute!.hubEquipmentKey).toBe("MDB6-01R");
    expect(a.externalRoute!.trunk).toEqual(b.externalRoute!.trunk);
    expect(a.externalRoute!.points).not.toEqual(b.externalRoute!.points);
    expect(a.cable.cable_id).not.toBe(b.cable.cable_id);
    const normalized = (connection: typeof a) => connection.source.equipment_key.localeCompare(connection.target.equipment_key) > 0
      ? [...connection.externalRoute!.points].reverse() : connection.externalRoute!.points;
    expect(a.externalRoute!.bundleLane).not.toBe(b.externalRoute!.bundleLane);
    expect(Math.abs(normalized(a)[3].x - normalized(b)[3].x)).toBeCloseTo(2);
    expect(normalized(a)[0]).toEqual(normalized(b)[0]);
    expect(normalized(a).slice(0, 4)).not.toEqual(normalized(b).slice(0, 4));
    expect(normalized(a)[normalized(a).length - 1]).not.toEqual(normalized(b)[normalized(b).length - 1]);
    data.cables.reverse();
    expect(buildCombinedLayoutScene(data).geometry.map(({ path }) => path).reverse()).toEqual(scene.geometry.map(({ path }) => path));
  });

  it("retains direct cubic arcs for shared outdoor feeds to the second floor", () => {
    const scene = buildCombinedLayoutScene(manifest());
    const feeder = scene.connections.find(({ cable: record }) => record.cable_id === "F-B")!;
    expect(feeder.externalKind).toBe("shared-feed");
    expect(feeder.externalRoute).toBeUndefined();
    const geometry = scene.geometry.find(({ connection }) => connection === feeder)!;
    expect(geometry.route).toBe("arc");
    expect(geometry.path).toContain(" C ");
    expect(geometry.path).not.toContain(" L ");
    const native = placedLayoutCables([feeder.cable], [feeder.source, feeder.target], scene.regions)[0];
    expect(geometry.path).toBe(layoutCablePath(native));
  });

  it("keeps room-edge routes stable and compact independent of input order and feeder direction", () => {
    const data = manifest();
    data.cables!.push(cable("F", "V"));
    const first = buildCombinedLayoutScene(data);
    data.cables = data.cables!.reverse().map((record) => ({ ...record,
      source_equipment_key: record.target_equipment_key, target_equipment_key: record.source_equipment_key }));
    const reversed = buildCombinedLayoutScene(data);
    for (const item of first.geometry.filter(({ connection }) => connection.externalKind)) {
      expect(reversed.geometry.find(({ connection }) => connection.cable.cable_id === item.connection.cable.cable_id)!.path).toBe(item.path);
    }
    for (const connection of first.connections.filter((item) => item.externalRoute)) {
      for (const point of connection.externalRoute!.points) {
        expect(point.x).toBeGreaterThanOrEqual(first.contentBounds.x);
        expect(point.x).toBeLessThanOrEqual(first.contentBounds.x + first.contentBounds.width);
      }
    }
  });

  it("preserves ambiguous source positions and does not invent a port or draw unresolved cables", () => {
    const data = manifest();
    data.fixed_equipment.push(device("F", "first", 270, 200, true));
    data.cables!.push({ ...cable("A", "V"), connection_status: "unresolved" });
    const scene = buildCombinedLayoutScene(data);
    expect(scene.rows.filter((row) => row.equipment_key === "F")).toHaveLength(2);
    expect(scene.connections.some(({ source, target }) => source.equipment_key === "F" || target.equipment_key === "F")).toBe(false);
    expect(scene.connections.some(({ cable: record }) => record.connection_status !== "resolved")).toBe(false);
  });

  it("does not mistake an overlapping second-floor room for a first-floor endpoint's room", () => {
    const data = manifest();
    data.floors[1].regions![0].rect = { x: 240, y: 180, width: 200, height: 60 };
    const scene = buildCombinedLayoutScene(data);
    const feeder = scene.connections.find(({ cable: record }) => record.cable_id === "A-U")!;
    expect(feeder.roomToOverhead).toBe(true);
    expect(feeder.overheadRoom?.source_floor_id).toBe("first");
    const original = placedLayoutCables([feeder.cable], data.floors[0].equipment, data.floors[0].regions)[0];
    expect(layoutCablePath(feeder)).toBe(layoutCablePath(original));
  });
});
