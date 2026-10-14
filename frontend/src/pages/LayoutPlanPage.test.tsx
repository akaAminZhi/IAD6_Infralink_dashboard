import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LayoutEquipmentRecord, LayoutPlanManifest } from "../types/data";
import { fetchJson } from "../utils/dataLoaders";
import { LAYOUT_OVERRIDES_KEY, readLayoutOverrides, visibleLayoutEquipment } from "../utils/layoutPlanUtils";
import { LayoutPlanPage } from "./LayoutPlanPage";

vi.mock("../utils/dataLoaders", () => ({ fetchJson: vi.fn() }));
const fetchMock = vi.mocked(fetchJson);

function device(label: string, values: Partial<LayoutEquipmentRecord> = {}): LayoutEquipmentRecord {
  return {
    annotation_id: label, equipment_key: label, label,
    rect: { x: label === "EQ-1" ? 100 : 10, y: 20, width: 30, height: 20 },
    fixed: false, source_floor_id: "first", match_status: "matched",
    matched_equipment_id: `IAD06-${label}`, candidate_equipment_ids: [`IAD06-${label}`],
    energized_completed_at: null, system_element_status: "L3", ...values,
  };
}
function dataset(): LayoutPlanManifest {
  return {
    generated_at: "2026-10-14", selected_input_files: {}, diagnostics: [],
    floors: [
      { floor_id: "first", label: "First Floor", file_name: "first.pdf", page_number: 1, width: 100, height: 100,
        equipment: [device("EQ-1", { energized_completed_at: "2026-10-14T08:00:00" }), device("EQ-UNKNOWN", { match_status: "ambiguous" })] },
      { floor_id: "second", label: "Second Floor", file_name: "second.pdf", page_number: 1, width: 100, height: 100,
        equipment: [device("EQ-2"), device("EQ-FIX", { annotation_id: "duplicate-fixed" })] },
    ],
    fixed_equipment: [device("EQ-FIX", { fixed: true })],
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(dataset());
});

describe("LayoutPlanPage", () => {
  it("preserves repeated fixed ID placements from the source floor and avoids copies from later floors", () => {
    const manifest = dataset();
    manifest.fixed_equipment.push(
      device("EQ-FIX", { fixed: true, annotation_id: "fixed-second-position", rect: { x: 60, y: 20, width: 30, height: 20 } }),
      device("EQ-FIX", { fixed: true, annotation_id: "fixed-later-floor", source_floor_id: "second" }),
    );
    const rows = visibleLayoutEquipment(manifest, "second");
    expect(rows.filter((row) => row.fixed).map((row) => row.annotation_id)).toEqual(["EQ-FIX", "fixed-second-position"]);
  });
  it("renders only equipment with rounded rectangles and date-derived red lightning", async () => {
    const { container } = render(<LayoutPlanPage />);
    expect(await screen.findByRole("button", { name: "EQ-1: Energized" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EQ-UNKNOWN: Unknown" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(container.querySelector("rect")).toHaveAttribute("rx");
    expect(screen.getByRole("img", { name: "EQ-1 Energized lightning" })).toHaveAttribute("fill", "#b91c1c");
    expect(screen.getByRole("button", { name: "EQ-1: Energized" }).querySelector("rect")).toHaveAttribute("fill", "#f87171");
    expect(screen.queryByRole("button", { name: /^(boundary|fix):/i })).not.toBeInTheDocument();
  });

  it("keeps fixed equipment coordinates and overrides across floors and resets every floor", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const fixed = await screen.findByRole("button", { name: "EQ-FIX: Not Energized" });
    const before = fixed.querySelector("rect")?.outerHTML;
    await user.click(fixed);
    await user.click(screen.getByRole("button", { name: "Energize today" }));
    expect(screen.getByRole("img", { name: "EQ-FIX Energize today lightning" })).toHaveAttribute("fill", "#f97316");
    expect(readLayoutOverrides()["EQ-FIX"]).toBe("energizeToday");
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    expect(screen.queryByRole("button", { name: "EQ-1: Energized" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "EQ-FIX: Energize today" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "EQ-2: Not Energized" }));
    await user.click(screen.getByRole("button", { name: "Energize today" }));
    await user.selectOptions(screen.getByLabelText("Floor"), "first");
    await user.click(screen.getByRole("button", { name: "Reset all statuses" }));
    expect(screen.getByRole("button", { name: "EQ-FIX: Not Energized" }).querySelector("rect")?.outerHTML).toBe(before);
    expect(screen.getByRole("button", { name: "EQ-1: Energized" })).toBeInTheDocument();
    expect(localStorage.getItem(LAYOUT_OVERRIDES_KEY)).toBeNull();
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    expect(screen.getByRole("button", { name: "EQ-2: Not Energized" })).toBeInTheDocument();
  });

  it("restores persisted manual overrides and supports keyboard selection and device reset", async () => {
    localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify({ "EQ-FIX": "energizeToday" }));
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const row = await screen.findByRole("button", { name: "EQ-FIX: Energize today" });
    row.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Energize today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Equipment status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset device" }));
    expect(screen.getByRole("button", { name: "EQ-FIX: Not Energized" })).toBeInTheDocument();
  });

  it("finds equipment and zooms to selection", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "EQ-1: Energized" });
    const map = screen.getByRole("img", { name: "First Floor equipment layout" });
    const original = map.getAttribute("viewBox");
    await user.type(screen.getByLabelText("Find equipment"), "EQ-UNKNOWN");
    expect(screen.getByRole("img", { name: "EQ-1 Energized lightning" }).closest("[data-lightning-key]")).toHaveAttribute("opacity", "0.2");
    expect(screen.getByRole("listbox", { name: "Equipment suggestions" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /EQ-UNKNOWN/ }));
    expect(screen.getByRole("button", { name: "EQ-UNKNOWN: Unknown" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(map.getAttribute("viewBox")).not.toBe(original);
    await user.click(screen.getByRole("button", { name: "Fit layout" }));
    expect(map).toHaveAttribute("viewBox", original);
  });

  it("confirms keyboard suggestions and changes floor before zooming", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "EQ-1: Energized" });
    await user.type(screen.getByLabelText("Find equipment"), "EQ-");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByLabelText("Floor")).toHaveValue("second");
    expect(screen.getByRole("button", { name: "EQ-2: Not Energized" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Find equipment")).toHaveValue("EQ-2");
    await user.click(screen.getByLabelText("Find equipment"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it.each(["EQ-1", "EQ-FIX"])("prevents planning Energized equipment %s", async (equipmentId) => {
    if (equipmentId === "EQ-FIX") localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify({ "EQ-FIX": "energized" }));
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: `${equipmentId}: Energized` }));
    const button = screen.getByRole("button", { name: "Energize today" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(screen.getByRole("img", { name: `${equipmentId} Energized lightning` })).toBeInTheDocument();
    expect(readLayoutOverrides()).toEqual(equipmentId === "EQ-FIX" ? { "EQ-FIX": "energized" } : {});
  });

  it("keeps Excel-confirmed Energized above an old planning override", async () => {
    localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify({ "EQ-1": "energizeToday" }));
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: "EQ-1: Energized" }));
    expect(screen.getByRole("button", { name: "Energize today" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Energize today" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("From SystemElements Excel")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset device" }));
    expect(readLayoutOverrides()).toEqual({});
    expect(screen.getByRole("img", { name: "EQ-1 Energized lightning" })).toBeInTheDocument();
  });

  it("toggles planning on unenergized equipment", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: "EQ-FIX: Not Energized" }));
    const button = screen.getByRole("button", { name: "Energize today" });
    await user.click(button);
    expect(screen.getByRole("img", { name: "EQ-FIX Energize today lightning" })).toBeInTheDocument();
    await user.click(button);
    expect(screen.getByRole("button", { name: "EQ-FIX: Not Energized" })).toBeInTheDocument();
    expect(readLayoutOverrides()).toEqual({});
  });

  it("shows a readable full ID on hover or keyboard focus without zooming", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const device = await screen.findByRole("button", { name: "EQ-FIX: Not Energized" });
    const map = screen.getByRole("img", { name: "First Floor equipment layout" });
    const before = map.getAttribute("viewBox");
    await user.hover(device);
    expect(screen.getByRole("tooltip")).toHaveTextContent("IAD06-EQ-FIX");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Not Energized");
    expect(device).toHaveAttribute("aria-describedby", "layout-equipment-tooltip");
    expect(map).toHaveAttribute("viewBox", before);
    await user.unhover(device);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(device);
    expect(screen.getByRole("tooltip")).toHaveTextContent("IAD06-EQ-FIX");
    fireEvent.keyDown(device, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders PODs and room names without selectable equipment roles", async () => {
    const manifest = dataset();
    manifest.floors[0].regions = [{ annotation_id: "room-1", label: "E6-110-01", kind: "room", fixed: false,
      source_floor_id: "first", rect: { x: 90, y: 10, width: 50, height: 50 } }];
    manifest.fixed_regions = [{ annotation_id: "pod-1", label: "POD", kind: "pod", fixed: true,
      source_floor_id: "first", rect: { x: 60, y: 20, width: 20, height: 50 } }];
    fetchMock.mockResolvedValue(manifest);
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "EQ-1: Energized" });
    expect(container.querySelector('[data-layout-region="pod"]')).toBeInTheDocument();
    expect(container.querySelector('[data-room-label="E6-110-01"] text')).toHaveTextContent("E6-110-01");
    expect(screen.queryByRole("button", { name: /POD|E6-110-01/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    expect(container.querySelector('[data-layout-region="pod"]')).toBeInTheDocument();
    expect(container.querySelector('[data-layout-region="room"]')).not.toBeInTheDocument();
  });

  it("keeps room names behind equipment and every lightning in the last SVG layer", async () => {
    const user = userEvent.setup();
    const manifest = dataset();
    manifest.floors[0].regions = [{ annotation_id: "room-1", label: "E6-110-01", kind: "room", fixed: false,
      source_floor_id: "first", rect: { x: 0, y: 0, width: 150, height: 80 } }];
    fetchMock.mockResolvedValue(manifest);
    const { container } = render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "EQ-1: Energized" });
    const map = screen.getByRole("img", { name: "First Floor equipment layout" });
    expect([...map.children].map((element) => element.getAttribute("data-layout-layer"))).toEqual([
      "regions", "room-labels", "equipment", "selection", "lightning",
    ]);
    const before = container.querySelector('[data-room-label="E6-110-01"]')?.outerHTML;
    await user.click(screen.getByRole("button", { name: "EQ-FIX: Not Energized" }));
    await user.click(screen.getByRole("button", { name: "Energize today" }));
    expect(container.querySelector('[data-room-label="E6-110-01"]')?.outerHTML).toBe(before);
    expect(container.querySelector('[data-layout-layer="equipment"] .animate-energisation-breathe')).not.toBeInTheDocument();
    expect(container.querySelector('[data-layout-layer="lightning"]')?.querySelectorAll('.animate-energisation-breathe')).toHaveLength(2);
  });

  it("box-selects devices without panning and batch-plans only unenergized equipment", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const map = await screen.findByRole("img", { name: "First Floor equipment layout" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
    const before = map.getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "Box select" }));
    await user.pointer([
      { target: map, keys: "[MouseLeft>]", coords: { clientX: 0, clientY: 0 } },
      { target: map, coords: { clientX: 600, clientY: 400 } },
      { target: map, keys: "[/MouseLeft]", coords: { clientX: 600, clientY: 400 } },
    ]);
    expect(map).toHaveAttribute("viewBox", before);
    expect(screen.getByRole("status")).toHaveTextContent("3 selected");
    await user.click(screen.getByRole("button", { name: "Energize today (2)" }));
    expect(readLayoutOverrides()).toEqual({ "EQ-FIX": "energizeToday", "EQ-UNKNOWN": "energizeToday" });
    expect(screen.getByRole("img", { name: "EQ-1 Energized lightning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Energize today (0)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reset all statuses" }));
    expect(readLayoutOverrides()).toEqual({});
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
  });

  it("allows click/keyboard selection, clearing and Escape cancellation in box-select mode", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const device = await screen.findByRole("button", { name: "EQ-FIX: Not Energized" });
    await user.click(screen.getByRole("button", { name: "Box select" }));
    await user.click(device);
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
    fireEvent.keyDown(device, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
    await user.click(device);
    fireEvent.keyDown(device, { key: "Escape" });
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
    await user.click(device);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
  });

  it("zooms the viewBox on wheel without scrolling the page", async () => {
    render(<LayoutPlanPage />);
    const map = await screen.findByRole("img", { name: "First Floor equipment layout" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
    const initial = map.getAttribute("viewBox")!.split(" ").map(Number);
    const wheel = new WheelEvent("wheel", { deltaY: -100, clientX: 300, clientY: 200, bubbles: true, cancelable: true });
    fireEvent(map, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const zoomed = map.getAttribute("viewBox")!.split(" ").map(Number);
    expect(zoomed[2]).toBeLessThan(initial[2]);
    fireEvent.wheel(map, { deltaY: 100, clientX: 300, clientY: 200 });
    expect(Number(map.getAttribute("viewBox")!.split(" ")[2])).toBeGreaterThan(zoomed[2]);
  });

  it("pans when dragging from equipment and suppresses accidental selection", async () => {
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const device = await screen.findByRole("button", { name: "EQ-1: Energized" });
    const map = screen.getByRole("img", { name: "First Floor equipment layout" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
    const original = map.getAttribute("viewBox");
    await user.pointer([
      { target: device, keys: "[MouseLeft>]", coords: { clientX: 200, clientY: 150 } },
      { target: device, coords: { clientX: 250, clientY: 180 } },
      { target: device, keys: "[/MouseLeft]", coords: { clientX: 250, clientY: 180 } },
    ]);
    expect(map.getAttribute("viewBox")).not.toBe(original);
    expect(screen.queryByRole("button", { name: "Energize today" })).not.toBeInTheDocument();
  });

  it("shows a retryable missing dataset error", async () => {
    fetchMock.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "EQ-1: Energized" })).toBeInTheDocument();
  });

  it("ignores malformed and unsupported saved status values", () => {
    localStorage.setItem(LAYOUT_OVERRIDES_KEY, "broken json");
    expect(readLayoutOverrides()).toEqual({});
    localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify({ valid: "energized", bad: "toString" }));
    expect(readLayoutOverrides()).toEqual({ valid: "energized" });
  });
});
