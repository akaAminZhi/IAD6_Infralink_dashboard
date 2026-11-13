import { describe, expect, it } from "vitest";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest, LayoutRegionRecord } from "../types/data";
import { layoutCableLanes, layoutCableMarkerPoint, layoutCablePath, layoutConnectionBounds, layoutDeviceHeight,
  overheadCablePoints, placedLayoutCables, projectLayoutPoint } from "./layoutIsometricUtils";
import { buildCombinedLayoutScene, LAYOUT_FLOOR_GAP } from "./layoutSceneUtils";
import { routeLayoutCables } from "./layoutCableRouting";

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

  it("stacks each floor's content just above the floor below and keeps the first floor and shared group in place", () => {
    const data = manifest(), before = JSON.stringify(data);
    const scene = buildCombinedLayoutScene(data);
    const [first, second, shared] = scene.groups;
    expect(first.offsetY).toBe(0);
    expect(shared.offsetY).toBe(0);
    expect(first.offsetY - second.offsetY).toBe(scene.floorLift);
    // group.rect is each floor's drawn content (already offset); the gap between them is the tunable constant.
    expect(first.rect.y - (second.rect.y + second.rect.height)).toBeGreaterThanOrEqual(LAYOUT_FLOOR_GAP - 1e-9);
    expect(first.rect.y - (second.rect.y + second.rect.height)).toBeLessThan(LAYOUT_FLOOR_GAP + 1);
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
    const original = routeLayoutCables(placedLayoutCables(data.cables!, floor.equipment, floor.regions), floor.regions ?? [], new Map());
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

  it("routes cross-floor links through one shared riser beside the rooms with accurate roof ports, warnings and fit bounds", () => {
    const scene = buildCombinedLayoutScene(manifest());
    expect(scene.connections).toHaveLength(6);
    expect(scene.connections.filter((item) => item.externalKind === "cross-floor")).toHaveLength(2);
    expect(scene.connections.filter((item) => item.externalKind === "shared-feed")).toHaveLength(1);
    for (const connection of scene.connections.filter((item) => item.externalKind === "cross-floor" && item.externalRoute)) {
      const points = overheadCablePoints(connection), trunk = connection.externalRoute!.trunk, riser = trunk[2];
      expect(riser.x).toBe(trunk[3].x);
      expect(Math.abs(riser.y - trunk[3].y)).toBeCloseTo(scene.floorLift);
      const [a, b] = [connection.source, connection.target].sort((x, y) => x.equipment_key.localeCompare(y.equipment_key));
      const port = (row: LayoutEquipmentRecord) => projectLayoutPoint(row.rect.x + row.rect.width / 2, row.rect.y + row.rect.height / 2, layoutDeviceHeight(row));
      expect(points[0]).toEqual(port(a));
      expect(points[points.length - 1]).toEqual(port(b));
      // The riser stands just outside the rooms' front-left corner, outside every deck's room strip.
      const hub = connection.source.equipment_key === connection.externalRoute!.hubEquipmentKey ? connection.source : connection.target;
      const hubRoom = scene.regions.find((region) => region.kind === "room" && region.source_floor_id === hub.source_floor_id)!;
      expect(riser.x).toBeLessThan(projectLayoutPoint(hubRoom.rect.x, hubRoom.rect.y + hubRoom.rect.height).x);
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

  it("merges MDB6-01R's two ATS-TX-INV6 feeders into one riser in front of the hub and splits them downstairs", () => {
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
    // Points run from the alphabetically first endpoint (ATS), so reverse to read from the hub.
    const fromHub = (connection: typeof a) => [...connection.externalRoute!.points].reverse();
    // Same source device: one shared rise, front run and riser; they split only on the lower floor.
    expect(fromHub(a).slice(0, 4)).toEqual(fromHub(b).slice(0, 4));
    expect(fromHub(a).slice(4)).not.toEqual(fromHub(b).slice(4));
    expect(a.externalRoute!.bundleLane).toBe(b.externalRoute!.bundleLane);
    for (const c of [a, b]) {
      const [, , bottom, top] = c.externalRoute!.trunk;
      expect(bottom.x).toBeCloseTo(top.x);
      expect(fromHub(c)).toContainEqual(bottom);
      expect(fromHub(c)).toContainEqual(top);
    }
    data.cables.reverse();
    expect(buildCombinedLayoutScene(data).geometry.map(({ path }) => path).reverse()).toEqual(scene.geometry.map(({ path }) => path));
  });

  it("keeps cross-floor feeders from different source devices on separate risers", () => {
    const data = manifest();
    data.floors[0].equipment = [device("LOW-1", "first", 40, 120), device("LOW-2", "first", 120, 120)];
    data.floors[1].equipment = [device("UP-1", "second", 60, 120), device("UP-2", "second", 140, 120)];
    data.cables = [cable("UP-1", "LOW-1"), cable("UP-2", "LOW-2")];
    const [a, b] = buildCombinedLayoutScene(data).connections;
    expect(a.externalRoute!.hubEquipmentKey).not.toBe(b.externalRoute!.hubEquipmentKey);
    expect(a.externalRoute!.bundleLane).not.toBe(b.externalRoute!.bundleLane);
    expect(a.externalRoute!.trunk[2]).not.toEqual(b.externalRoute!.trunk[2]);
  });

  it("routes shared outdoor feeds to the second floor through a straight riser and room-edge approach", () => {
    const scene = buildCombinedLayoutScene(manifest());
    const feeder = scene.connections.find(({ cable: record }) => record.cable_id === "F-B")!;
    expect(feeder.externalKind).toBe("shared-feed");
    expect(feeder.externalRoute?.hubEquipmentKey).toBe("F");
    // The outdoor feed climbs its own vertical riser directly in front of the device it serves.
    const [, , bottom, top] = feeder.externalRoute!.trunk;
    const target = feeder.source.fixed ? feeder.target : feeder.source;
    expect(bottom.x).toBeCloseTo(top.x);
    expect(top.y).toBeLessThan(bottom.y);
    expect(top.x - projectLayoutPoint(target.rect.x + target.rect.width / 2, target.rect.y + target.rect.height / 2).x).toBeLessThan(0);
    const crossFloor = scene.connections.find((item) => item.externalKind === "cross-floor")!;
    expect(bottom.x).not.toBeCloseTo(crossFloor.externalRoute!.trunk[2].x);
    const geometry = scene.geometry.find(({ connection }) => connection === feeder)!;
    expect(geometry.route).toBe("long");
    expect(geometry.path).not.toContain(" C ");
    expect(geometry.path).toContain(" L ");
    expect(geometry.path).toBe(layoutCablePath(feeder));
    const singleFloor = scene.singleFloorConnections.get("second")!.find((c) => c.cable.cable_id === "F-B")!;
    expect(singleFloor.externalKind).toBe("shared-feed");
    expect(singleFloor.externalRoute?.hubEquipmentKey).toBe("F");
    expect(layoutCablePath(singleFloor)).not.toContain(" C ");
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
        expect(point.x).toBeGreaterThanOrEqual(first.bounds.x);
        expect(point.x).toBeLessThanOrEqual(first.bounds.x + first.bounds.width);
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
