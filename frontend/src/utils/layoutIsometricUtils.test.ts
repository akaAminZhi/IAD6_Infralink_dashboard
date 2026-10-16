import { describe, expect, it } from "vitest";
import type { LayoutCableRecord, LayoutEquipmentRecord } from "../types/data";
import { isNearbyCable, layoutCableLanes, layoutCablePath, layoutConnectionBounds, layoutDeviceKind, overheadCablePoints, placedLayoutCables, projectLayoutPoint, projectedLayoutBounds } from "./layoutIsometricUtils";

const device = (key: string, x = 0): LayoutEquipmentRecord => ({ equipment_key: key, label: key, annotation_id: key,
  rect: { x, y: 20, width: 10, height: 8 }, fixed: false, source_floor_id: "first", match_status: "matched",
  matched_equipment_id: `IAD06-${key}`, candidate_equipment_ids: [], energized_completed_at: null, system_element_status: null });
const cable: LayoutCableRecord = { cable_id: "FDR-IAD06-A-IAD06-B", equipment_type: "Feeder Cable - LV", source_equipment_key: "A",
  target_equipment_key: "B", connection_status: "resolved", system_element_status: null, neta_complete: false, neta_test_report: null,
  mv_daily_test_status: null, mv_daily_test_date: null };

describe("2.5D geometry", () => {
  it("uses equal 2:1 axes with vertical equipment heights", () => {
    expect(projectLayoutPoint(10, 0)).toEqual({ x: 10, y: 5 });
    expect(projectLayoutPoint(0, 10)).toEqual({ x: -10, y: 5 });
    expect(projectLayoutPoint(10, 10, 7)).toEqual({ x: 0, y: 3 });
  });

  it("connects nearby cabinets with a low cubic arc rather than an elevated orthogonal run", () => {
    const connection = { cable, source: device("A"), target: device("B", 15) };
    expect(isNearbyCable(connection)).toBe(true);
    expect(layoutCablePath(connection)).toContain(" C ");
    expect(layoutCablePath(connection)).not.toContain(" L ");
    const [start, control] = overheadCablePoints(connection);
    expect(start.y - control.y).toBeLessThanOrEqual(12);
  });

  it("fits long room cable trays as well as both equipment footprints", () => {
    const connection = { cable, source: { ...device("A"), rect: { x: 0, y: 100, width: 10, height: 8 } }, target: device("B", 200) };
    expect(isNearbyCable(connection)).toBe(false);
    expect(layoutCablePath(connection)).toContain(" Q ");
    const [start, trayStart, trayEnd, end] = overheadCablePoints(connection);
    expect(layoutCablePath(connection)).toContain(`L ${start.x} ${trayStart.y + 5}`);
    expect(layoutCablePath(connection)).toContain(`L ${end.x} ${end.y}`);
    const intercept = Math.min(start.y - start.x * 0.5, end.y - end.x * 0.5) - 15;
    expect(trayStart.y - trayStart.x * 0.5).toBeCloseTo(intercept);
    expect(trayEnd.y - trayEnd.x * 0.5).toBeCloseTo(intercept);
    const bounds = layoutConnectionBounds(connection, 3);
    for (const point of overheadCablePoints(connection, 3)) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.x);
      expect(point.y).toBeGreaterThanOrEqual(bounds.y);
      expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });
  it.each([["TX6-01A", "mvTransformer"], ["UTILITY6-01", "utility"], ["GEN6-01A", "generator"],
    ["TX-UPP6-06A", "lvTransformer"], ["ATS-TX-HTP6-01A", "cabinet"], ["UPS6-01A", "cabinet"]])("models %s as %s", (key, kind) => {
    expect(layoutDeviceKind(device(key))).toBe(kind);
  });

  it("raises long room cable trays above both device tops and reserves height in projected bounds", () => {
    const connection = { cable, source: device("A"), target: device("B", 100) };
    const points = overheadCablePoints(connection);
    expect(points[1].y).toBeLessThan(points[0].y);
    expect(points[2].y).toBeLessThan(points[3].y);
    const bounds = projectedLayoutBounds(connection.source.rect, 42);
    expect(bounds.y).toBe(projectLayoutPoint(0, 20, 42).y);
    expect(bounds.height).toBeGreaterThan(42);
  });

  it("separates reverse feeders into upward lanes on the same base route", () => {
    const forward = { cable, source: device("A"), target: device("B", 100) };
    const reverse = { cable: { ...cable, cable_id: "FDR-IAD06-B-IAD06-A" }, source: forward.target, target: forward.source };
    const lanes = layoutCableLanes([forward, reverse]);
    expect(lanes[0]).not.toBe(lanes[1]);
    expect(lanes.every((lane) => lane <= 0)).toBe(true);
    expect(layoutCablePath(forward, lanes[0])).not.toBe(layoutCablePath(reverse, lanes[1]));
    expect(layoutCablePath(forward, lanes[0])).toBe(layoutCablePath(reverse, lanes[0]));
  });

  it("does not choose arbitrary repeated positions, missing floors, or unresolved endpoint pairs", () => {
    expect(placedLayoutCables([cable], [device("A"), device("B")])).toHaveLength(1);
    expect(placedLayoutCables([cable], [device("A")])).toHaveLength(0);
    expect(placedLayoutCables([cable], [device("A"), device("A", 5), device("B")])).toHaveLength(0);
    expect(placedLayoutCables([{ ...cable, connection_status: "ambiguous_cable_id" }], [device("A"), device("B")])).toHaveLength(0);
  });
});
