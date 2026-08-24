import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { MvEquipmentPage } from "./MvEquipmentPage";

describe("MvEquipmentPage", () => {
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
    expect(screen.getByText("MV Daily Tested 2")).toBeInTheDocument();
    expect(screen.getByText("MV Daily Failed 1")).toBeInTheDocument();
    expect(screen.getByText("Ship to Site 1")).toBeInTheDocument();
    expect(
      screen.getByText("Cable / Termination Installation Complete 1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Other status 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page 1, 4 annotations" })).not.toBeInTheDocument();

    const transformerRects = container.querySelectorAll("[data-mv-transformer='true'] rect");
    expect(transformerRects[1]).toHaveAttribute("stroke", "#16a34a");
    const terminationBody = container.querySelector("[data-mv-termination='true'] > circle");
    expect(terminationBody).toHaveAttribute("fill", "#fef3c7");
    expect(Number(terminationBody?.getAttribute("r"))).toBeGreaterThan(13);
    const cablePaths = container.querySelectorAll("[data-mv-connection='true'] path");
    expect(cablePaths[1]).toHaveAttribute("stroke", "#16a34a");
    expect(cablePaths[1].getAttribute("d")).toContain("Q");
    expect(cablePaths[1]).toHaveAttribute("stroke-width", "10");

    await user.click(
      screen.getByRole("button", { name: "FD01-IAD06-TX6-01A, cable connection" }),
    );
    expect(screen.getByRole("heading", { name: "FD01-IAD06-TX6-01A" })).toBeInTheDocument();
    expect(screen.getByText("Installation Complete", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Feeder Cable - MV")).toBeInTheDocument();
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
});
