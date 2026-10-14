import { describe, expect, it } from "vitest";
import type { LayoutEquipmentRecord, LayoutPlanManifest, LayoutRegionRecord } from "../types/data";
import { equipmentInLayoutSelection, insetEquipmentRect, layoutCanvasPoint, layoutRoomLabels, layoutSelectionRect, planLayoutSelection, visibleLayoutRegions, zoomLayoutViewport } from "./layoutPlanUtils";

describe("layout geometry", () => {
  it("retains distinct fixed POD placements while avoiding copied regions on later floors", () => {
    const pod: LayoutRegionRecord = { annotation_id: "pod-1", label: "POD", kind: "pod", fixed: true,
      source_floor_id: "first", rect: { x: 0, y: 0, width: 20, height: 50 } };
    const manifest = { floors: [], fixed_regions: [pod,
      { ...pod, annotation_id: "pod-2", rect: { ...pod.rect, x: 40 } },
      { ...pod, annotation_id: "pod-copy", source_floor_id: "second" },
    ] } as unknown as LayoutPlanManifest;
    expect(visibleLayoutRegions(manifest, "second").map((region) => region.annotation_id)).toEqual(["pod-1", "pod-2"]);
  });
  it("separates touching equipment while preserving centers and positive tiny dimensions", () => {
    const a = insetEquipmentRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = insetEquipmentRect({ x: 10, y: 0, width: 10, height: 10 });
    expect(a.x + a.width).toBeLessThan(b.x);
    expect(a.x + a.width / 2).toBe(5);
    const tiny = insetEquipmentRect({ x: 0, y: 0, width: 0.1, height: 0.1 });
    expect(tiny.width).toBeGreaterThan(0);
  });

  it("keeps the cursor's drawing point fixed with letterboxing and bounded zoom", () => {
    const view = { x: 100, y: 200, width: 400, height: 200 };
    const canvas = { left: 0, top: 0, width: 800, height: 600 };
    const anchor = layoutCanvasPoint(view, canvas, 200, 200);
    const zoomed = zoomLayoutViewport(view, view, 0.5, anchor);
    expect(layoutCanvasPoint(zoomed, canvas, 200, 200)).toEqual(anchor);
    expect(zoomLayoutViewport(view, view, 0.0001).width).toBe(8);
    expect(zoomLayoutViewport(view, view, 100).width).toBe(800);
  });

  it("keeps room labels centered at a fixed position inside the room", () => {
    const regions: LayoutRegionRecord[] = ["E6-110-01", "E6-110-02"].map((label) => ({
      annotation_id: label, label, kind: "room", fixed: false, source_floor_id: "first",
      rect: { x: 0, y: 20, width: 100, height: 100 },
    }));
    const labels = layoutRoomLabels(regions);
    for (const label of labels) {
      expect(label.rect.x + label.rect.width / 2).toBe(50);
      expect(label.rect.y).toBe(22);
      expect(label.rect.y + label.rect.height).toBeLessThanOrEqual(20 + 100 / 3);
    }
    expect(labels[1].rect).toEqual(labels[0].rect);
  });

  it("selects fully enclosed equipment in either drag direction, deduplicating IDs", () => {
    const selection = layoutSelectionRect({ x: 50, y: 50 }, { x: 0, y: 0 });
    expect(selection).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    const records = [
      { equipment_key: "inside", rect: { x: 5, y: 5, width: 20, height: 20 } },
      { equipment_key: "inside", rect: { x: 25, y: 5, width: 20, height: 20 } },
      { equipment_key: "partial", rect: { x: 45, y: 5, width: 20, height: 20 } },
      { equipment_key: "outside", rect: { x: 60, y: 60, width: 20, height: 20 } },
    ] as LayoutEquipmentRecord[];
    expect([...equipmentInLayoutSelection(records, selection)]).toEqual(["inside"]);
  });

  it("batch planning skips Energized equipment and keeps existing plans", () => {
    const records = ["confirmed", "planned", "fresh", "not-selected"].map((equipment_key) => ({
      equipment_key, match_status: "matched", energized_completed_at: equipment_key === "confirmed" ? "2026-10-14" : null,
    })) as LayoutEquipmentRecord[];
    const before = { planned: "energizeToday" as const };
    const selection = new Set(["confirmed", "planned", "fresh"]);
    const after = planLayoutSelection(records, selection, before);
    expect(after).toEqual({ planned: "energizeToday", fresh: "energizeToday" });
    expect(planLayoutSelection(records, selection, after)).toEqual(after);
    expect(before).toEqual({ planned: "energizeToday" });
  });
});
