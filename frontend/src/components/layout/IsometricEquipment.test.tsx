import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayoutEquipmentRecord } from "../../types/data";
import { IsometricEquipment } from "./IsometricEquipment";
import * as geometry from "../../utils/layoutIsometricUtils";

function record(key: string): LayoutEquipmentRecord {
  return { equipment_key: key, annotation_id: key, label: key, rect: { x: 0, y: 0, width: 30, height: 24 },
    fixed: false, source_floor_id: "first", match_status: "matched", matched_equipment_id: key,
    candidate_equipment_ids: [], energized_completed_at: null, system_element_status: null };
}

describe("industrial isometric equipment models", () => {
  it("updates selection without rebuilding the static model, while still updating equipment status", () => {
    const device = record("TX6-01A");
    const heightSpy = vi.spyOn(geometry, "layoutDeviceHeight");
    const { container, rerender } = render(<svg><IsometricEquipment record={device} status="notEnergized" selected={false} /></svg>);
    const body = container.querySelector("[data-device-model]");
    const initialCalls = heightSpy.mock.calls.length;
    rerender(<svg><IsometricEquipment record={device} status="notEnergized" selected /></svg>);
    expect(heightSpy.mock.calls.length).toBe(initialCalls);
    expect(container.querySelector("[data-device-model]")).toBe(body);
    rerender(<svg><IsometricEquipment record={device} status="energized" selected /></svg>);
    expect(heightSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    heightSpy.mockRestore();
  });
  it.each([
    ["TX6-01A", "oil-tank", "radiator-bank"],
    ["UTILITY6-01", "switchgear-bay", "ceramic-insulator"],
    ["GEN6-01A", "generator-acoustic-enclosure", "cooling-fan"],
    ["TX-UPP6-01A", "dry-transformer-enclosure", "overhanging-cover"],
    ["MDS6-01A", "cabinet-enclosure", "cabinet-door"],
  ])("gives %s distinct structure and three opaque, differently shaded visible faces", (key, body, feature) => {
    const { container } = render(<svg><IsometricEquipment record={record(key)} status="notEnergized" selected={false} /></svg>);
    const part = container.querySelector(`[data-model-part="${body}"]`)!;
    expect(part).toBeInTheDocument();
    expect(container.querySelector(`[data-model-part="${feature}"]`)).toBeInTheDocument();
    const faces = ["left", "right", "top"].map((face) => part.querySelector(`[data-enclosure-face="${face}"]`));
    expect(faces.every((face) => face?.getAttribute("fill") && face.getAttribute("fill") !== "none")).toBe(true);
    expect(new Set(faces.map((face) => face?.getAttribute("fill"))).size).toBe(3);
  });
});
