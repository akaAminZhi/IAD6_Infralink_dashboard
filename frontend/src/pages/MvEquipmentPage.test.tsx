import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { formatDateTime } from "../utils/formatters";
import { MvEquipmentPage } from "./MvEquipmentPage";

const mvCommentsApi = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../utils/automationApi", () => ({
  addMvEquipmentComment: mvCommentsApi.add,
  deleteMvEquipmentComment: mvCommentsApi.delete,
  getMvEquipmentComments: mvCommentsApi.get,
}));

describe("MvEquipmentPage", () => {
  beforeEach(() => {
    mvCommentsApi.add.mockReset();
    mvCommentsApi.delete.mockReset();
    mvCommentsApi.get.mockReset();
    mvCommentsApi.get.mockResolvedValue({ comments: [] });
  });

  it.each(["TX6-01A", "UTILITY6-01"])("shows NETA completion and current failed items for %s", async (label) => {
    const user = userEvent.setup();
    const completedAt = "2026-09-10T14:30:00";
    const data = makeDashboardData({
      equipment: [{ equipment_id: `IAD06-${label}`, neta_complete: true, neta_completed_at: completedAt }],
      epsTestItems: [
        { module_equipment: label, item_status: "Failed", test_item: "Insulation" },
        { module_equipment: label, item_status: "Failed - pending", test_item: "Resistance" },
        { module_equipment: label, item_status: "Fixed", test_item: "Grounding" },
        { module_equipment: "OTHER", item_status: "Failed" },
      ],
      powerPlanManifest: { pages: [{
        page_id: "mv", page_label: "MV", document_name: "Electrical-IAD6-MV.pdf", page_number: 1,
        width: 1000, height: 700,
        annotations: [{ annotation_id: "mv-1", kind: "equipment", label,
          matched_equipment_id: `IAD06-${label}`, system_element_status: "NETA Complete",
          mv_daily_test_status: "failed",
          rect: { x: 100, y: 100, width: 180, height: 90 }, center: { x: 190, y: 145 },
        }],
      }] },
    });
    const { container, rerender } = render(<MvEquipmentPage data={data} />);
    expect(container.querySelectorAll("[data-mv-equipment='true'] rect")[1]).toHaveAttribute("fill", "#d1fae5");
    expect(screen.getByLabelText(`${label}: 2 failed test items`)).toHaveTextContent("2");
    expect(screen.getByText("NETA Complete 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${label}, MV ${label.startsWith("TX") ? "transformer" : "equipment"}` }));
    expect(screen.getByText(formatDateTime(completedAt))).toBeInTheDocument();

    rerender(<MvEquipmentPage data={{ ...data, equipment: [{ ...data.equipment[0], neta_completed_at: null }], epsTestItems: [] }} />);
    await user.click(screen.getByRole("button", { name: `${label}, MV ${label.startsWith("TX") ? "transformer" : "equipment"}` }));
    expect(screen.getByText("Completion date unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText(`${label}: 1 failed test items`)).toHaveTextContent("1");
  });

  it("shows open-issue equipment in red until NETA is complete and badges the issue count", () => {
    const data = makeDashboardData({
      equipment: [{ equipment_id: "IAD06-TX6-02A", neta_complete: false }],
      cases: [
        { case_id: "CASE-OPEN-1", equipment_id: "IAD06-TX6-02A", status: "Open" },
        { case_id: "CASE-OPEN-2", equipment_id: "IAD06-TX6-02A", status: "Acknowledged" },
        { case_id: "CASE-CLOSED", equipment_id: "IAD06-TX6-02A", status: "Closed" },
      ],
      powerPlanManifest: { pages: [{
        page_id: "mv", page_label: "MV", document_name: "Electrical-IAD6-MV.pdf", page_number: 1,
        width: 1000, height: 700,
        annotations: [{ annotation_id: "mv-open-issue", kind: "equipment", label: "TX6-02A",
          matched_equipment_id: "IAD06-TX6-02A", system_element_status: "Ship to Site",
          rect: { x: 100, y: 100, width: 180, height: 90 }, center: { x: 190, y: 145 },
        }],
      }] },
    });
    const { container, rerender } = render(<MvEquipmentPage data={data} />);

    expect(container.querySelectorAll("[data-mv-equipment='true'] rect")[1]).toHaveAttribute("fill", "#fee2e2");
    expect(screen.getByLabelText("TX6-02A: 2 open issues")).toHaveTextContent("2");

    rerender(<MvEquipmentPage data={{
      ...data,
      equipment: [{ ...data.equipment[0], neta_complete: true }],
    }} />);

    expect(container.querySelectorAll("[data-mv-equipment='true'] rect")[1]).toHaveAttribute("fill", "#d1fae5");
    expect(screen.getByLabelText("TX6-02A: 2 open issues")).toHaveTextContent("2");
  });

  it("combines PDF pages and draws all MV annotations on one canvas", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      cases: [
        {
          case_id: "CASE-MV-1",
          equipment_id: "IAD06-FD01-IAD06-TX6-01A",
          system_element_raw: "IAD06-FD01-IAD06-TX6-01A",
          status: "Acknowledged",
          priority: "High",
          summary: "MV cable insulation test requires corrective action.",
        },
      ],
      powerPlanManifest: {
        pages: [
          {
            page_id: "electrical-iad6-mv-1",
            document_name: "Electrical-IAD6-MV.pdf",
            page_number: 1,
            page_label: "Electrical-IAD6-MV / Page 1",
            width: 1000,
            height: 700,
            annotations: [
              {
                annotation_id: "equipment-1",
                kind: "equipment",
                annotation_type: "Square",
                label: "TX6-01A",
                rect: { x: 300, y: 180, width: 180, height: 90 },
                center: { x: 390, y: 225 },
                matched_equipment_id: "IAD06-TX6-01A",
                system_element_status: "Ship to Site",
                system_element_type: "Transformer - MV",
                mv_daily_test_status: "tested_and_passed",
                mv_daily_test_date: "2026-08-18",
                mv_daily_tested_dates: ["2026-08-18"],
                mv_daily_test_history: [
                  {
                    date: "2026-08-18",
                    status: "tested_and_passed",
                    report_name: "8-18.md",
                  },
                ],
              },
              {
                annotation_id: "equipment-2",
                kind: "equipment",
                annotation_type: "Square",
                label: "UTILITY6-01",
                rect: { x: 40, y: 40, width: 230, height: 110 },
                center: { x: 155, y: 95 },
                matched_equipment_id: "IAD06-UTILITY6-01",
                system_element_status: "Ship to Site",
                system_element_type: "Utility Switchgear [tag]",
              },
              {
                annotation_id: "termination-1",
                kind: "termination",
                annotation_type: "Square",
                label: "FD01-IAD06-TX6-01A-A",
                rect: { x: 485, y: 215, width: 18, height: 18 },
                center: { x: 494, y: 224 },
                matched_equipment_id: "FD01-IAD06-TX6-01A-A",
                system_element_status: "Installation Complete",
                system_element_type: "Termination-MV",
              },
              {
                annotation_id: "connection-1",
                kind: "connection",
                annotation_type: "PolyLine",
                label: "FD01-IAD06-TX6-01A",
                rect: { x: 500, y: 220, width: 160, height: 100 },
                center: { x: 580, y: 270 },
                vertices: [
                  { x: 500, y: 220 },
                  { x: 650, y: 220 },
                  { x: 650, y: 320 },
                ],
                matched_equipment_id: "FD01-IAD06-TX6-01A",
                system_element_status: "Installation Complete",
                system_element_type: "Feeder Cable - MV",
                mv_daily_test_status: "tested_and_passed",
                mv_daily_test_date: "2026-08-18",
                mv_daily_tested_dates: ["2026-08-18"],
                mv_daily_test_history: [
                  {
                    date: "2026-08-18",
                    status: "tested_and_passed",
                    report_name: "8-18.md",
                  },
                ],
              },
            ],
          },
          {
            page_id: "electrical-iad6-mv-2",
            document_name: "Electrical-IAD6-MV.pdf",
            page_number: 2,
            page_label: "Electrical-IAD6-MV / Page 2",
            width: 1000,
            height: 700,
            annotations: [
              {
                annotation_id: "equipment-3",
                kind: "equipment",
                annotation_type: "Square",
                label: "MDB6-02A",
                rect: { x: 120, y: 160, width: 190, height: 95 },
                center: { x: 215, y: 207.5 },
                matched_equipment_id: "IAD06-MDB6-02A",
                system_element_status: "IFC",
                system_element_type: "Switchgear-MV",
                mv_daily_test_status: "failed",
                mv_daily_test_date: "2026-08-19",
                mv_daily_tested_dates: ["2026-08-19"],
                mv_daily_test_history: [
                  {
                    date: "2026-08-19",
                    status: "failed",
                    report_name: "8-19.md",
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const { container } = render(
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          <MvEquipmentPage data={data} />
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>,
    );

    expect(screen.getByText("MV Equipment")).toBeInTheDocument();
    expect(screen.getByText("3 equipment")).toBeInTheDocument();
    expect(screen.getByText("1 termination")).toBeInTheDocument();
    expect(screen.getByText("1 connection")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-mv-equipment='true']")).toHaveLength(3);
    expect(container.querySelectorAll("[data-mv-transformer='true']")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "UTILITY6-01, MV equipment" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-mv-termination='true']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-mv-connection='true']")).toHaveLength(1);
    expect(screen.getByText("Cable Tested + Infralink Updated 0")).toBeInTheDocument();
    expect(screen.getByText("Cable Tested / Infralink Pending 1")).toBeInTheDocument();
    expect(screen.getByText("MV Daily Passed / NETA Pending 1")).toBeInTheDocument();
    expect(screen.getByText("MV Daily Failed 1")).toBeInTheDocument();
    expect(screen.getByText("Ship to Site 1")).toBeInTheDocument();
    expect(
      screen.getByText("Cable / Termination Installation Complete 1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Other status 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page 1, 4 annotations" })).not.toBeInTheDocument();

    const transformerRects = container.querySelectorAll("[data-mv-transformer='true'] rect");
    expect(transformerRects[1]).toHaveAttribute("stroke", "#86efac");
    expect(transformerRects[1]).toHaveAttribute("fill", "#f0fdf4");
    const terminationBody = container.querySelector("[data-mv-termination='true'] > circle");
    expect(terminationBody).toHaveAttribute("fill", "#fef3c7");
    expect(Number(terminationBody?.getAttribute("r"))).toBeGreaterThan(13);
    const cablePaths = container.querySelectorAll("[data-mv-connection='true'] path");
    expect(cablePaths[1]).toHaveAttribute("stroke", "#2563eb");
    expect(cablePaths[1].getAttribute("d")).toContain("Q");
    expect(cablePaths[1]).toHaveAttribute("stroke-width", "10");

    await user.click(
      screen.getByRole("button", { name: "FD01-IAD06-TX6-01A, cable connection" }),
    );
    expect(screen.getByRole("heading", { name: "FD01-IAD06-TX6-01A" })).toBeInTheDocument();
    expect(screen.getByText("Installation Complete", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Feeder Cable - MV")).toBeInTheDocument();
    expect(screen.getByText("Tested - Infralink Update Pending")).toBeInTheDocument();
    expect(screen.getByText("Tested And Passed")).toBeInTheDocument();
    expect(screen.getByText("Aug 18, 2026")).toBeInTheDocument();
    expect(screen.getByText("CASE-MV-1")).toBeInTheDocument();
    expect(screen.getByText("1 open / 1 total")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /CASE-MV-1/ }));
    expect(screen.getByRole("heading", { name: "CASE-MV-1" })).toBeInTheDocument();
    expect(
      screen.getAllByText("MV cable insulation test requires corrective action."),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Close issue detail" }));

    await user.click(
      screen.getByRole("button", { name: "FD01-IAD06-TX6-01A-A, termination" }),
    );
    expect(screen.getByRole("heading", { name: "FD01-IAD06-TX6-01A-A" })).toBeInTheDocument();
    expect(screen.getByText("Installation Complete", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Drawing type")).not.toBeInTheDocument();

    const failedEquipment = screen.getByRole("button", { name: "MDB6-02A, MV equipment" });
    expect(failedEquipment.querySelectorAll("rect")[1]).toHaveAttribute("stroke", "#dc2626");
    expect(failedEquipment.querySelectorAll("rect")[1]).toHaveAttribute("fill", "#ef4444");
    await user.click(failedEquipment);
    expect(screen.getByRole("heading", { name: "MDB6-02A" })).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Aug 19, 2026")).toBeInTheDocument();
  });

  it("only paints a tested cable green after its Infralink status reaches L3", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      powerPlanManifest: {
        pages: [
          {
            page_id: "electrical-iad6-mv-l3",
            document_name: "Electrical-IAD6-MV.pdf",
            page_number: 1,
            page_label: "Electrical-IAD6-MV / Page 1",
            width: 900,
            height: 500,
            annotations: [
              {
                annotation_id: "connection-l3",
                kind: "connection",
                annotation_type: "PolyLine",
                label: "FD01-IAD06-TX6-06B",
                rect: { x: 100, y: 100, width: 250, height: 80 },
                center: { x: 225, y: 140 },
                vertices: [
                  { x: 100, y: 100 },
                  { x: 350, y: 100 },
                  { x: 350, y: 180 },
                ],
                matched_equipment_id: "FD01-IAD06-TX6-06B",
                system_element_status: "L3: Pre Func Testing & Startup",
                system_element_type: "Feeder Cable - MV",
                mv_daily_test_status: "tested_and_passed",
                feeder_cable_atp_names: ["FD01 Cable ATP.pdf"],
                feeder_cable_atp_status: "available",
                feeder_cable_atp_required: true,
                feeder_cable_atp_files: [
                  {
                    file_name: "FD01 Cable ATP.pdf",
                    relative_path: "FD01-IAD06-TX6-06B/FD01 Cable ATP.pdf",
                    url: "/feeder-cable-atp/FD01-IAD06-TX6-06B/FD01%20Cable%20ATP.pdf",
                  },
                ],
              },
              {
                annotation_id: "connection-pending",
                kind: "connection",
                annotation_type: "PolyLine",
                label: "FD01-IAD06-TX6-05A",
                rect: { x: 450, y: 100, width: 250, height: 80 },
                center: { x: 575, y: 140 },
                vertices: [
                  { x: 450, y: 100 },
                  { x: 700, y: 100 },
                  { x: 700, y: 180 },
                ],
                matched_equipment_id: "FD01-IAD06-TX6-05A",
                system_element_status: "Installation Complete",
                system_element_type: "Feeder Cable - MV",
                mv_daily_test_status: "tested_and_passed",
              },
              {
                annotation_id: "connection-missing-atp",
                kind: "connection",
                annotation_type: "PolyLine",
                label: "FD02-IAD06-TX6-06B",
                rect: { x: 100, y: 260, width: 250, height: 80 },
                center: { x: 225, y: 300 },
                vertices: [
                  { x: 100, y: 260 },
                  { x: 350, y: 260 },
                  { x: 350, y: 340 },
                ],
                matched_equipment_id: "FD02-IAD06-TX6-06B",
                system_element_status: "L3: Pre Func Testing & Startup",
                system_element_type: "Feeder Cable - MV",
                mv_daily_test_status: "tested_and_passed",
                feeder_cable_atp_names: ["FD02 Cable ATP.pdf"],
                feeder_cable_atp_status: "missing_required",
                feeder_cable_atp_required: true,
                feeder_cable_atp_files: [],
              },
            ],
          },
        ],
      },
    });

    render(
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          <MvEquipmentPage data={data} />
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>,
    );

    expect(screen.getByText("Cable Tested + Infralink Updated 2")).toBeInTheDocument();
    expect(screen.getByText("Cable Tested / Infralink Pending 1")).toBeInTheDocument();
    expect(screen.getByText("L3 Missing ATP 1")).toBeInTheDocument();

    const updatedCable = screen.getByRole("button", {
      name: "FD01-IAD06-TX6-06B, cable connection",
    });
    const pendingCable = screen.getByRole("button", {
      name: "FD01-IAD06-TX6-05A, cable connection",
    });
    expect(updatedCable.querySelectorAll("path")[1]).toHaveAttribute("stroke", "#16a34a");
    expect(pendingCable.querySelectorAll("path")[1]).toHaveAttribute("stroke", "#2563eb");

    await user.click(updatedCable);
    expect(screen.getByText("Tested + Infralink Updated", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("L3: Pre Func Testing & Startup", { exact: true }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /FD01 Cable ATP\.pdf/ }));
    expect(screen.getByTitle("FD01 Cable ATP.pdf")).toHaveAttribute(
      "src",
      "/feeder-cable-atp/FD01-IAD06-TX6-06B/FD01%20Cable%20ATP.pdf",
    );
    await user.click(screen.getByRole("button", { name: "Close Feeder Cable ATP preview" }));

    await user.click(
      screen.getByRole("button", { name: "FD02-IAD06-TX6-06B, cable connection" }),
    );
    expect(screen.getByText("Required file missing")).toBeInTheDocument();
    expect(
      screen.getByText("L3 status requires a downloaded Feeder Cable ATP PDF."),
    ).toBeInTheDocument();
  });

  it("shows saved comments beside the MV item and adds a new comment from its details", async () => {
    const user = userEvent.setup();
    const existingComment = {
      comment_id: "comment-1",
      annotation_id: "equipment-1",
      text: "Coordinate protection settings with commissioning.",
      created_at: "2026-09-03T14:30:00+00:00",
    };
    const newComment = {
      comment_id: "comment-2",
      annotation_id: "equipment-1",
      text: "Relay settings confirmed.",
      created_at: "2026-09-03T15:00:00+00:00",
    };
    mvCommentsApi.get.mockResolvedValue({ comments: [existingComment] });
    mvCommentsApi.add.mockResolvedValue({ comment: newComment });
    const data = makeDashboardData({
      powerPlanManifest: {
        pages: [
          {
            page_id: "electrical-iad6-mv-1",
            document_name: "Electrical-IAD6-MV.pdf",
            page_number: 1,
            page_label: "Electrical-IAD6-MV / Page 1",
            width: 900,
            height: 500,
            annotations: [
              {
                annotation_id: "equipment-1",
                kind: "equipment",
                annotation_type: "Square",
                label: "TX6-01A",
                rect: { x: 300, y: 180, width: 180, height: 90 },
                center: { x: 390, y: 225 },
                matched_equipment_id: "IAD06-TX6-01A",
                system_element_status: "Installation Complete",
                system_element_type: "Transformer - MV",
              },
            ],
          },
        ],
      },
    });

    const { container } = render(
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          <MvEquipmentPage data={data} />
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll("[data-mv-comment-indicator='true']")).toHaveLength(1);
    });
    expect(
      container.querySelector("[aria-label='View 1 comment for TX6-01A']"),
    ).toBeInTheDocument();
    expect(
      container.querySelector("[data-mv-comment-indicator='true'] animateTransform"),
    ).toHaveAttribute("values", "0 0; 0 -5; 0 0");

    await user.click(screen.getByRole("button", { name: "View 1 comment for TX6-01A" }));
    expect(screen.getByText(existingComment.text)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add comment"), newComment.text);
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(mvCommentsApi.add).toHaveBeenCalledWith({
      annotation_id: "equipment-1",
      text: newComment.text,
    });
    expect(await screen.findByText(newComment.text)).toBeInTheDocument();
    expect(
      container.querySelector("[aria-label='View 2 comments for TX6-01A']"),
    ).toBeInTheDocument();

    mvCommentsApi.delete.mockResolvedValue({ comment_id: newComment.comment_id });
    await user.click(screen.getByRole("button", { name: `Delete comment: ${newComment.text}` }));
    expect(mvCommentsApi.delete).toHaveBeenCalledWith(newComment.comment_id);
    await waitFor(() => {
      expect(screen.queryByText(newComment.text)).not.toBeInTheDocument();
    });
  });
});
