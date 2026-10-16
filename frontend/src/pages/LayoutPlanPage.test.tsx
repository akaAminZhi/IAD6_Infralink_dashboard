import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest } from "../types/data";
import { LAYOUT_VIEW_KEY } from "../utils/layoutIsometricUtils";
import * as isometricUtils from "../utils/layoutIsometricUtils";
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
  localStorage.setItem(LAYOUT_VIEW_KEY, "plan");
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(dataset());
});

describe("2.5D Layout connections", () => {
  function cable(values: Partial<LayoutCableRecord> = {}): LayoutCableRecord {
    return { cable_id: "FDR-IAD06-EQ-1-IAD06-EQ-FIX", equipment_type: "Feeder Cable - LV",
      source_equipment_key: "EQ-1", target_equipment_key: "EQ-FIX", connection_status: "resolved",
      system_element_status: "Installation Complete", neta_complete: false, neta_test_report: null,
      mv_daily_test_status: null, mv_daily_test_date: null, ...values };
  }
  function isometricDataset() {
    localStorage.removeItem(LAYOUT_VIEW_KEY);
    const manifest = dataset();
    manifest.cables = [cable(), cable({ cable_id: "FDR-IAD06-EQ-1-IAD06-EQ-2", target_equipment_key: "EQ-2" })];
    fetchMock.mockResolvedValue(manifest);
    return manifest;
  }

  it("defaults to 2.5D, only draws same-view unique endpoints, and shows cable IDs and test evidence", async () => {
    const manifest = isometricDataset();
    manifest.cables![0].system_element_status = "L3: Pre Func Testing & Startup";
    manifest.floors[0].equipment.push(device("FD-TERM-A", { equipment_type: "Termination" }),
      device("FD-CABLE", { equipment_type: "Feeder Cable - LV" }));
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    expect(await screen.findByRole("button", { name: "2.5D" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("[data-device-kind]")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /FD-TERM-A|FD-CABLE/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-cable-id]")).toHaveLength(1);
    expect(container.querySelector('[data-cable-state="updated"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /FDR-IAD06-EQ-1-IAD06-EQ-FIX:/ }));
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("From: EQ-1");
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("To: EQ-FIX");
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("Tested + Infralink Updated");
    expect(screen.getByRole("button", { name: "EQ-FIX: Not Energized" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-mv-termination]")).not.toBeInTheDocument();
  });

  it("uses EPS daily cable results even when MV daily has no entry", async () => {
    const manifest = isometricDataset();
    manifest.cables![0].eps_daily_test_status = "tested";
    manifest.cables![0].eps_daily_test_date = "2026-10-14";
    manifest.cables![0].eps_daily_report_name = "10-14.md";
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "2.5D" });
    expect(container.querySelector('[data-cable-state="pending"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /FDR-IAD06-EQ-1-IAD06-EQ-FIX:/ }));
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("Tested - Infralink Update Pending");
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("EPS daily: tested · 2026-10-14 · 10-14.md");
  });

  it("treats an Infralink Feeder Cable ATP report as the primary cable test evidence", async () => {
    const manifest = isometricDataset();
    manifest.cables![0] = cable({
      cable_id: "FDR-IAD06-MDB6-01A-IAD06-ATS-TX-HTP6-01A",
      system_element_status: "Pre-Installation Complete",
      eps_daily_test_status: "tested",
      feeder_cable_atp_names: ["FDR-IAD06-MDB6-01A-IAD06-ATS-TX-HTP6-01A.pdf"],
    });
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    await screen.findByRole("button", { name: "2.5D" });
    expect(container.querySelector('[data-cable-state="updated"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /FDR-IAD06-MDB6-01A-IAD06-ATS-TX-HTP6-01A:/ }));
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("Tested + Infralink Updated");
  });

  it("opens equipment and exact-ID cable PDFs from the shared report manifest", async () => {
    const manifest = isometricDataset();
    const equipmentReport = "IAD06-EQ-1 - NETA Test Report-01.pdf";
    const gcEquipmentReport = "IAD06-EQ-1-NETA-01.pdf";
    const cableReport = "FDR-IAD06-EQ-1-IAD06-EQ-FIX.pdf";
    const atpReport = "EQ-1 Cable ATP.pdf";
    manifest.floors[0].equipment[0].neta_test_report = equipmentReport;
    manifest.cables![0].feeder_cable_atp_names = [atpReport];
    manifest.cables![0].feeder_cable_atp_files = [{ file_name: atpReport,
      relative_path: `${manifest.cables![0].cable_id}/${atpReport}`, url: "/feeder-cable-atp/eq-1.pdf" }];
    const user = userEvent.setup();
    const { container } = render(<NetaReportManifestProvider manifest={{ records: [
      { report_name: equipmentReport, url: "/neta-reports/eq-1.pdf", source_key: "downloaded" },
      { report_name: gcEquipmentReport, source_report_name: equipmentReport,
        url: "/neta-reports-gc/eq-1-renamed.pdf", source_key: "gc" },
      { report_name: cableReport, url: "/neta-reports-gc/cable.pdf", source_key: "gc" },
      { report_name: "FDR-IAD06-EQ-1-IAD06-EQ-FIX-1.pdf", url: "/neta-reports-gc/other.pdf", source_key: "gc" },
    ] }}><LayoutPlanPage /></NetaReportManifestProvider>);
    await user.click(await screen.findByRole("button", { name: "EQ-1: Energized" }));
    expect(screen.getByLabelText("Equipment test reports")).toHaveTextContent(gcEquipmentReport);
    expect(screen.getByLabelText("Equipment test reports")).not.toHaveTextContent(equipmentReport);
    expect(screen.getByRole("button", { name: "Energize today" }).compareDocumentPosition(
      screen.getByLabelText("Equipment test reports")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Equipment test reports").querySelector(".grid-cols-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Connected cables")).toHaveTextContent("Feeder Cable ATP PDF");
    await user.click(screen.getByRole("button", { name: gcEquipmentReport }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", "/neta-reports-gc/eq-1-renamed.pdf");
    await user.click(screen.getByRole("button", { name: "Close NETA report preview" }));
    await user.click(container.querySelector(`[data-cable-id="${manifest.cables![0].cable_id}"]`)!);
    expect(screen.getByLabelText("Feeder Cable ATP reports")).toHaveTextContent(atpReport);
    await user.click(screen.getByRole("button", { name: atpReport }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", "/feeder-cable-atp/eq-1.pdf");
    await user.click(screen.getByRole("button", { name: /^Close Feeder Cable ATP preview$/ }));
    expect(screen.getByLabelText("Cable test reports")).toHaveTextContent(cableReport);
    expect(screen.getByLabelText("Cable test reports")).not.toHaveTextContent("FIX-1.pdf");
    await user.click(screen.getByRole("button", { name: cableReport }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", "/neta-reports-gc/cable.pdf");
  });

  it("shows the same linked cable PDF only once", async () => {
    const manifest = isometricDataset();
    const report = `${manifest.cables![0].cable_id}.pdf`;
    manifest.cables![0].neta_test_report = report;
    manifest.cables![0].feeder_cable_atp_names = [report];
    manifest.cables![0].feeder_cable_atp_files = [
      { file_name: report, relative_path: `${manifest.cables![0].cable_id}/${report}`,
        url: `/feeder-cable-atp/${report}` },
    ];
    const user = userEvent.setup();
    const { container } = render(<NetaReportManifestProvider manifest={{ records: [
      { report_name: report, url: `/neta-reports-gc/${report}`, source_key: "gc" },
    ] }}><LayoutPlanPage /></NetaReportManifestProvider>);
    await user.click(await screen.findByRole("button", { name: /FDR-IAD06-EQ-1-IAD06-EQ-FIX:/ }));
    expect(screen.getByLabelText("Feeder Cable ATP reports")).toHaveTextContent(report);
    expect(screen.queryByLabelText("Cable test reports")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: report }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", `/feeder-cable-atp/${report}`);
  });

  it("traces a device's cables, treats partial as unconfirmed, and preserves missing-report problems", async () => {
    const manifest = isometricDataset();
    manifest.cables![0] = cable({ mv_daily_test_status: "failed", system_element_status: "L3: Pre Func Testing & Startup",
      neta_complete: true });
    manifest.cables![1].mv_daily_test_status = "partially_tested";
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: "EQ-1: Energized" }));
    const list = screen.getByLabelText("Connected cables");
    expect(list).toHaveTextContent("Connected cables (2)");
    expect(list).toHaveTextContent("Test Failed");
    expect(list).toHaveTextContent("Testing Not Confirmed");
    expect(screen.queryByText("Partially Tested")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /↔ EQ-FIX/ }));
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("NETA complete but report is missing");
    await user.click(screen.getByRole("button", { name: /↔ EQ-2/ }));
    expect(screen.getByLabelText("Cable details")).toHaveTextContent("another floor");
    expect(screen.getByRole("button", { name: "Zoom to connection" })).toBeDisabled();
  });

  it("can hide cables, switch to the preserved plan, and clears cable selection on floor changes", async () => {
    isometricDataset();
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: /FDR-IAD06-EQ-1-IAD06-EQ-FIX:/ }));
    await user.click(screen.getByRole("button", { name: "Hide all cables" }));
    expect(container.querySelector("[data-layout-layer=cables]")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    expect(screen.queryByLabelText("Cable details")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2D plan" }));
    expect(container.querySelector("[data-device-kind]")).not.toBeVisible();
    expect(localStorage.getItem(LAYOUT_VIEW_KEY)).toBe("plan");
    expect(screen.getByRole("button", { name: "EQ-2: Not Energized" })).toBeInTheDocument();
  });

  it("keeps cable visibility off across global reset, floor/view changes and connection inspection", async () => {
    isometricDataset();
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    await user.click(await screen.findByRole("button", { name: "Hide all cables" }));
    expect(screen.getByRole("button", { name: "Show all cables" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("[data-cable-id]")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Global view" }));
    await user.click(screen.getByRole("button", { name: "EQ-1: Energized" }));
    await user.click(screen.getByRole("button", { name: /↔ EQ-FIX/ }));
    expect(screen.getByLabelText("Cable details")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-cable-id]")).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("Floor"), "second");
    await user.click(screen.getByRole("button", { name: "2D plan" }));
    await user.click(screen.getByRole("button", { name: "2.5D" }));
    expect(screen.getByRole("button", { name: "Show all cables" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-cable-id]")).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("Floor"), "first");
    await user.click(screen.getByRole("button", { name: "Show all cables" }));
    expect(container.querySelectorAll("[data-cable-id]")).toHaveLength(1);
  });

  it("reuses model DOM and cable paths for hover, camera changes and repeated view switches", async () => {
    isometricDataset();
    const pathSpy = vi.spyOn(isometricUtils, "layoutCablePath");
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    const device = await screen.findByRole("button", { name: "EQ-FIX: Not Energized" });
    const model = device.querySelector("[data-device-model]");
    const pathCalls = pathSpy.mock.calls.length;
    expect(pathCalls).toBe(1);
    await user.hover(device);
    expect(screen.getByRole("tooltip")).toHaveTextContent("EQ-FIX");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "2D plan" }));
    expect(model).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "2.5D" }));
    expect(model).toBeVisible();
    expect(container.querySelector('[data-equipment-key="EQ-FIX"] [data-device-model]')).toBe(model);
    expect(pathSpy.mock.calls.length).toBe(pathCalls);
    pathSpy.mockRestore();
  });

  it("does not select a cable when dragging its path to pan", async () => {
    isometricDataset();
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const line = await screen.findByRole("button", { name: /FDR-IAD06-EQ-1-IAD06-EQ-FIX:/ });
    const map = screen.getByRole("img", { name: "First Floor equipment layout" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
    const original = map.getAttribute("viewBox");
    await user.pointer([
      { target: line, keys: "[MouseLeft>]", coords: { clientX: 200, clientY: 150 } },
      { target: line, coords: { clientX: 250, clientY: 180 } },
    ]);
    expect(map).toHaveAttribute("viewBox", original);
    expect(map.closest("[data-layout-pan]")).toHaveStyle({ transform: "translate(50px, 30px)" });
    await user.pointer({ target: line, keys: "[/MouseLeft]", coords: { clientX: 250, clientY: 180 } });
    expect(map.getAttribute("viewBox")).not.toBe(original);
    expect(map.closest("[data-layout-pan]")).not.toHaveStyle({ transform: "translate(50px, 30px)" });
    expect(screen.queryByLabelText("Cable details")).not.toBeInTheDocument();
  });

  it("restores the entire scene, search and camera with Global view without changing planned statuses", async () => {
    isometricDataset();
    localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify({ "EQ-FIX": "energizeToday" }));
    const user = userEvent.setup();
    const { container } = render(<LayoutPlanPage />);
    const map = await screen.findByRole("img", { name: "First Floor equipment layout" });
    const original = map.getAttribute("viewBox");
    await user.type(screen.getByLabelText("Find equipment"), "EQ-1");
    await user.click(screen.getByRole("option", { name: /EQ-1/ }));
    expect(map).toHaveAttribute("viewBox", original);
    await user.click(screen.getByRole("button", { name: "Zoom to device" }));
    expect(map.getAttribute("viewBox")).not.toBe(original);
    await user.click(screen.getByRole("button", { name: "Global view" }));
    expect(map).toHaveAttribute("viewBox", original);
    expect(screen.getByLabelText("Find equipment")).toHaveValue("");
    expect(screen.queryByLabelText("Connected cables")).not.toBeInTheDocument();
    expect([...container.querySelectorAll("[data-equipment-key]")].every((element) => element.getAttribute("opacity") === "1")).toBe(true);
    expect(readLayoutOverrides()).toEqual({ "EQ-FIX": "energizeToday" });
  });

  it("omits offscreen 2.5D models after zoom and restores them in the global view", async () => {
    const manifest = isometricDataset();
    manifest.floors[0].equipment.push(device("EQ-FAR", { rect: { x: 4000, y: 4000, width: 30, height: 20 } }));
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    expect(await screen.findByRole("button", { name: "EQ-FAR: Not Energized" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "EQ-1: Energized" }));
    await user.click(screen.getByRole("button", { name: "Zoom to device" }));
    expect(screen.queryByRole("button", { name: "EQ-FAR: Not Energized" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Global view" }));
    expect(screen.getByRole("button", { name: "EQ-FAR: Not Energized" })).toBeInTheDocument();
  });

  it("clears focus from empty space and restores the full camera with Escape", async () => {
    isometricDataset();
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const map = await screen.findByRole("img", { name: "First Floor equipment layout" });
    const original = map.getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "EQ-1: Energized" }));
    expect(screen.getByLabelText("Connected cables")).toBeInTheDocument();
    await user.click(map);
    expect(screen.queryByLabelText("Connected cables")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Find equipment"), "EQ-1");
    await user.click(screen.getByRole("option", { name: /EQ-1/ }));
    fireEvent.keyDown(map, { key: "Escape" });
    expect(map).toHaveAttribute("viewBox", original);
    expect(screen.getByLabelText("Find equipment")).toHaveValue("");
    expect(screen.queryByLabelText("Connected cables")).not.toBeInTheDocument();
  });

  it("keeps the camera and toolbar height stable while selecting equipment and its cables", async () => {
    isometricDataset();
    const user = userEvent.setup();
    render(<LayoutPlanPage />);
    const map = await screen.findByRole("img", { name: "First Floor equipment layout" });
    const clearFocusButton = screen.getByText("Clear focus").closest("button")!;
    expect(clearFocusButton).toHaveClass("invisible");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomed = map.getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "EQ-1: Energized" }));
    expect(map).toHaveAttribute("viewBox", zoomed);
    expect(clearFocusButton).not.toHaveClass("invisible");
    await user.click(screen.getByRole("button", { name: /↔ EQ-FIX/ }));
    expect(map).toHaveAttribute("viewBox", zoomed);
    await user.click(screen.getByRole("button", { name: "Clear focus" }));
    expect(map).toHaveAttribute("viewBox", zoomed);
    expect(clearFocusButton).toHaveClass("invisible");
  });
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
    expect([...map.querySelector("[data-layout-scene]")!.children].map((element) => element.getAttribute("data-layout-layer"))).toEqual([
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
    await waitFor(() => expect(Number(map.getAttribute("viewBox")!.split(" ")[2])).toBeLessThan(initial[2]));
    const zoomed = map.getAttribute("viewBox")!.split(" ").map(Number);
    expect(zoomed[2]).toBeLessThan(initial[2]);
    fireEvent.wheel(map, { deltaY: 100, clientX: 300, clientY: 200 });
    await waitFor(() => expect(Number(map.getAttribute("viewBox")!.split(" ")[2])).toBeGreaterThan(zoomed[2]));
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
