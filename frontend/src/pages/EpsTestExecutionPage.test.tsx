import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeDashboardData } from "../test/fixtures";
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

    render(<EpsTestExecutionPage data={data} />);

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
});
