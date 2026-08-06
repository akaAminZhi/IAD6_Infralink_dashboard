import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { makeDashboardData } from "../test/fixtures";
import type { KprSummary } from "../types/data";
import { EpsTestExecutionPage } from "./EpsTestExecutionPage";

vi.mock("@nivo/pie", () => ({
  ResponsivePie: () => <div data-testid="nivo-pie" />,
}));

describe("EpsTestExecutionPage", () => {
  it("filters the test item and PDM tables to current failures", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      epsTestSummary: {
        test_item_count: 2,
        passed_test_item_count: 1,
        failed_test_item_count: 1,
        status_counts: { Failed: 1 },
        failed_count: 1,
      },
      epsPdmExecution: [
        {
          pdm_name: "PDM-A",
          eps_execution_status: "Failed",
          failed_count: 1,
          module_equipment_count: 2,
        },
      ],
      epsModuleExecution: [
        {
          pdm_name: "PDM-A",
          module_equipment: "EQ-PASS",
          eps_test_status: "Complete",
          tracker_item_count: 1,
          completed_test_item_count: 1,
        },
        {
          pdm_name: "PDM-A",
          module_equipment: "EQ-FAIL",
          eps_test_status: "Failed",
          tracker_item_count: 1,
          failed_test_item_count: 1,
        },
      ],
      epsTestItems: [
        {
          pdm_name: "PDM-A",
          module_equipment: "EQ-PASS",
          equipment_name: "PASS-ITEM",
          equipment_key: "PASS-ITEM",
          item_status: "Passed",
          tracker_type: "METER",
          tracker_row: 1,
        },
        {
          pdm_name: "PDM-A",
          module_equipment: "EQ-FAIL",
          equipment_name: "FAIL-ITEM",
          equipment_key: "FAIL-ITEM",
          item_status: "Failed",
          tracker_type: "CT",
          tracker_row: 2,
        },
      ],
    });

    render(
      <MemoryRouter>
        <EpsTestExecutionPage data={data} />
      </MemoryRouter>,
    );

    expect(screen.getByText("PASS-ITEM")).toBeInTheDocument();
    expect(screen.getByText("FAIL-ITEM")).toBeInTheDocument();
    const failedLabel = screen.getAllByText("Current Failed").find(
      (element) => element.closest("button") !== null,
    );
    expect(failedLabel).toBeDefined();

    await user.click(failedLabel!.closest("button")!);

    expect(screen.queryByText("PASS-ITEM")).not.toBeInTheDocument();
    expect(screen.getByText("FAIL-ITEM")).toBeInTheDocument();
    expect(screen.getByText("Current Failed filter")).toBeInTheDocument();
  });

  it("applies an EPS status filter supplied by an Overview URL", () => {
    const data = makeDashboardData({
      epsTestSummary: {
        status_counts: {
          Complete: 1,
          "Complete, Waiting Infralink NETA Completion": 1,
        },
        complete_count: 1,
        waiting_infralink_neta_count: 1,
      },
      epsPdmExecution: [
        { pdm_name: "PDM-COMPLETE", eps_execution_status: "Complete" },
        {
          pdm_name: "PDM-WAITING",
          eps_execution_status: "Complete, Waiting Infralink NETA Completion",
        },
      ],
      epsModuleExecution: [
        {
          pdm_name: "PDM-COMPLETE",
          module_equipment: "COMPLETE-EQ",
          eps_test_status: "Complete",
        },
        {
          pdm_name: "PDM-WAITING",
          module_equipment: "WAITING-EQ",
          eps_test_status: "Complete, Waiting Infralink NETA Completion",
        },
      ],
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/eps-test-execution?status=Complete%2C%20Waiting%20Infralink%20NETA%20Completion",
        ]}
      >
        <EpsTestExecutionPage data={data} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", {
        name: /Complete, Waiting Infralink NETA Completion/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("PDM-WAITING")).toBeInTheDocument();
    expect(screen.queryByText("PDM-COMPLETE")).not.toBeInTheDocument();
  });

  it("matches a KPR passed cohort by exact test item instead of the whole module", () => {
    const data = makeDashboardData({
      kprSummary: {
        monthly_progress: {
          eps: {
            daily_passed_month_equipment_ids: ["ITEM-1"],
          },
        },
      } as unknown as KprSummary,
      epsTestSummary: {
        test_item_count: 2,
        passed_test_item_count: 2,
        status_counts: { Complete: 1 },
      },
      epsPdmExecution: [{ pdm_name: "PDM-A", eps_execution_status: "Complete" }],
      epsModuleExecution: [
        {
          pdm_name: "PDM-A",
          module_equipment: "MODULE-A",
          eps_test_status: "Complete",
        },
      ],
      epsTestItems: [
        {
          pdm_name: "PDM-A",
          module_equipment: "MODULE-A",
          equipment_name: "ITEM-1",
          equipment_key: "ITEM-1",
          item_status: "Passed",
        },
        {
          pdm_name: "PDM-A",
          module_equipment: "MODULE-A",
          equipment_name: "ITEM-2",
          equipment_key: "ITEM-2",
          item_status: "Passed",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/eps-test-execution?kprFilter=passedMonth"]}>
        <EpsTestExecutionPage data={data} />
      </MemoryRouter>,
    );

    expect(screen.getByText("ITEM-1")).toBeInTheDocument();
    expect(screen.queryByText("ITEM-2")).not.toBeInTheDocument();
  });
});
