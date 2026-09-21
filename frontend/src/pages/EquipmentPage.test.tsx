import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNetaReportReviewCache } from "../utils/automationApi";
import { clearPublishedNetaReviewCache } from "../utils/loadNetaReportReviews";

import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import type { KprSummary } from "../types/data";
import { EquipmentPage } from "./EquipmentPage";

describe("EquipmentPage", () => {
  beforeEach(() => {
    clearNetaReportReviewCache();
    clearPublishedNetaReviewCache();
  });
  afterEach(() => vi.restoreAllMocks());
  it("shows current columns, excludes resolved cases from open count, and opens asset details", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "IAD06-PDM-E6-210-01",
          equipment: [
            {
              equipment_id: "IAD06-PDU6-01D-4",
              source_equipment_label: "PDU6-01D-4",
              status: "Conditional Yellow Tag",
              neta_complete: true,
              neta_test_report: "Report-01.pdf",
              cases: [
                {
                  case_id: "CASE-RESOLVED",
                  status: "Resolved",
                  summary: "Resolved issue",
                },
              ],
            },
          ],
        },
      ],
      equipment: [
        {
          equipment_id: "IAD06-PDU6-01D-4",
          equipment_type: "Power Distribution Unit",
          manufacturer: "IEM",
          model: "PDU54SHAM",
          serial_number: "J02PDU000-00032",
          neta_complete: true,
          neta_test_report: "Report-01.pdf",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/equipment"]}>
        <NetaReportManifestProvider manifest={null}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Equipment Lookup Table")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "EPS Status" })).not.toBeInTheDocument();
    const equipmentCell = screen.getByRole("cell", { name: "IAD06-PDU6-01D-4" });
    const row = equipmentCell.closest("tr");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("0");

    await user.click(equipmentCell);
    expect(screen.getByText("Asset Information")).toBeInTheDocument();
    expect(screen.getByText("IEM")).toBeInTheDocument();
    expect(screen.getByText("PDU54SHAM")).toBeInTheDocument();
    expect(screen.getByText("J02PDU000-00032")).toBeInTheDocument();
  });

  it("applies an exact KPR lifecycle-stage equipment cohort", () => {
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "PDM-A",
          equipment: [{ equipment_id: "IAD06-EQ-IN", source_equipment_label: "EQ-IN" }],
        },
        {
          pdm_name: "PDM-B",
          equipment: [{ equipment_id: "IAD06-EQ-OUT", source_equipment_label: "EQ-OUT" }],
        },
      ],
      kprSummary: {
        equipment_lifecycle: {
          stages: [{ key: "ifc", equipment_ids: ["IAD06-EQ-IN"] }],
        },
      } as unknown as KprSummary,
    });

    render(
      <MemoryRouter initialEntries={["/equipment?lifecycleStage=ifc"]}>
        <NetaReportManifestProvider manifest={null}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("IAD06-EQ-IN")).toBeInTheDocument();
    expect(screen.queryByText("IAD06-EQ-OUT")).not.toBeInTheDocument();
  });

  it("applies an exact KPR lifecycle-transition equipment cohort", () => {
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "PDM-A",
          equipment: [{ equipment_id: "IAD06-EQ-MOVED" }],
        },
        {
          pdm_name: "PDM-B",
          equipment: [{ equipment_id: "IAD06-EQ-OTHER" }],
        },
      ],
      kprSummary: {
        equipment_lifecycle: {
          transitions: [
            {
              from_key: "ifc",
              to_key: "neta_complete",
              equipment_ids: ["IAD06-EQ-MOVED"],
            },
          ],
        },
      } as unknown as KprSummary,
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/equipment?lifecycleTransition=ifc%3Aneta_complete",
        ]}
      >
        <NetaReportManifestProvider manifest={null}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("IAD06-EQ-MOVED")).toBeInTheDocument();
    expect(screen.queryByText("IAD06-EQ-OTHER")).not.toBeInTheDocument();
  });

  it.each([false, true])("filters and shows evidence (published read-only: %s)", async (readOnly) => {
    const user = userEvent.setup();
    const reviews = {
      total_reports: 2,
      summary: { PASSED: 0, FAILED: 1, REVIEW_REQUIRED: 1, ERROR: 0 },
      reports: [
        { file: "IAD06-EQ-FAILED/IAD06-EQ-FAILED.pdf", status: "FAILED", is_passed: false },
        {
          file: "IAD06-EQ-REVIEW/IAD06-EQ-REVIEW.pdf",
          status: "REVIEW_REQUIRED",
          is_passed: null,
          evidence: ["Page 2: Verify breaker settings."],
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (readOnly && String(input).startsWith("http://127.0.0.1")) {
        throw new Error("Local service unavailable");
      }
      if (init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            report: {
              file: "IAD06-EQ-REVIEW/IAD06-EQ-REVIEW.pdf",
              status: "PASSED",
              is_passed: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(reviews), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "PDM-A",
          equipment: [
            {
              equipment_id: "IAD06-EQ-FAILED",
              neta_complete: true,
              neta_test_report: "IAD06-EQ-FAILED - NETA Test Report-01.pdf",
            },
            {
              equipment_id: "IAD06-EQ-REVIEW",
              neta_complete: true,
              neta_test_report: "IAD06-EQ-REVIEW - NETA Test Report-01.pdf",
            },
          ],
        },
      ],
      netaReportManifest: {
        records: [
          {
            source_key: "gc",
            report_name: "IAD06-EQ-FAILED.pdf",
            source_report_name: "IAD06-EQ-FAILED - NETA Test Report-01.pdf",
            relative_path: "IAD06-EQ-FAILED/IAD06-EQ-FAILED.pdf",
          },
          {
            source_key: "gc",
            report_name: "IAD06-EQ-REVIEW.pdf",
            source_report_name: "IAD06-EQ-REVIEW - NETA Test Report-01.pdf",
            relative_path: "IAD06-EQ-REVIEW/IAD06-EQ-REVIEW.pdf",
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/equipment"]}>
        <NetaReportManifestProvider manifest={data.netaReportManifest}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    const failedCard = (await screen.findByText("Failed NETA Reports")).closest("button");
    expect(failedCard).not.toBeNull();
    await waitFor(() => expect(failedCard).toHaveTextContent("1"));
    await user.click(failedCard!);
    expect(screen.getByText("IAD06-EQ-FAILED")).toBeInTheDocument();
    expect(screen.queryByText("IAD06-EQ-REVIEW")).not.toBeInTheDocument();

    await user.click(failedCard!);
    await user.click(screen.getByRole("cell", { name: "IAD06-EQ-REVIEW" }));
    expect(document.querySelector('[data-review-status="REVIEW_REQUIRED"]')).not.toBeNull();
    expect(screen.getByText("Page 2: Verify breaker settings.")).toBeInTheDocument();
    if (readOnly) {
      expect(screen.getByText("Read only")).toBeInTheDocument();
      expect(screen.queryByLabelText(
        "Review result for IAD06-EQ-REVIEW - NETA Test Report-01.pdf",
      )).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close equipment detail" }));
      await user.click(screen.getByText("NETA Review Required").closest("button")!);
      expect(screen.getByRole("cell", { name: "IAD06-EQ-REVIEW" })).toBeInTheDocument();
      expect(screen.queryByRole("cell", { name: "IAD06-EQ-FAILED" })).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
      return;
    }
    await user.selectOptions(
      screen.getByLabelText(
        "Review result for IAD06-EQ-REVIEW - NETA Test Report-01.pdf",
      ),
      "PASSED",
    );
    await waitFor(() =>
      expect(document.querySelector('[data-review-status="PASSED"]')).not.toBeNull(),
    );
    expect(screen.queryByText("Page 2: Verify breaker settings.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/automation/neta-report-reviews",
      expect.objectContaining({ method: "PUT" }),
    );
    fetchMock.mockRestore();
  });

});
