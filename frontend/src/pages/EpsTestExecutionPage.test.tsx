import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { makeDashboardData } from "../test/fixtures";
import type { KprSummary } from "../types/data";
import { EpsTestExecutionPage } from "./EpsTestExecutionPage";

async function expandExecutionTables(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole("button", { name: "Show" });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  }
}

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

    expect(screen.queryByText("PASS-ITEM")).not.toBeInTheDocument();
    expect(screen.queryByText("PDM-A")).not.toBeInTheDocument();
    await expandExecutionTables(user);
    expect(screen.getByText("PASS-ITEM")).toBeInTheDocument();
    expect(screen.getByText("FAIL-ITEM")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Current Failed: 1 test items" }));

    expect(screen.queryByText("PASS-ITEM")).not.toBeInTheDocument();
    expect(screen.getByText("FAIL-ITEM")).toBeInTheDocument();
    expect(screen.getByText("Current Failed filter")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PDM and test item details" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Remove test result filter/ }));

    expect(screen.getByText("PASS-ITEM")).toBeInTheDocument();
    expect(screen.getByText("FAIL-ITEM")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active execution filters")).not.toBeInTheDocument();
  });

  it("applies an EPS status filter supplied by an Overview URL", async () => {
    const user = userEvent.setup();
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
    await expandExecutionTables(user);
    expect(screen.getByText("PDM-WAITING")).toBeInTheDocument();
    expect(screen.queryByText("PDM-COMPLETE")).not.toBeInTheDocument();
  });

  it("matches a KPR passed cohort by exact test item instead of the whole module", async () => {
    const user = userEvent.setup();
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
          module_equipment_key: "ITEM-1",
          eps_test_status: "Complete",
        },
      ],
      epsTestItems: [
        {
          pdm_name: "PDM-A",
          module_equipment: "MODULE-A",
          module_equipment_key: "ITEM-1",
          equipment_name: "ITEM-1",
          equipment_key: "ITEM-1",
          item_status: "Passed",
        },
        {
          pdm_name: "PDM-A",
          module_equipment: "MODULE-A",
          module_equipment_key: "ITEM-1",
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

    await expandExecutionTables(user);
    expect(screen.getByText("ITEM-1")).toBeInTheDocument();
    expect(screen.queryByText("ITEM-2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "PDM-A" }));
    const moduleTable = screen.getByRole("columnheader", { name: "Equipment ID or Source Label" }).closest("table")!;
    await user.click(within(moduleTable).getByText("MODULE-A"));
    expect(screen.getByText("ITEM-2")).toBeInTheDocument();
  });

  it("filters the standalone table to newly passed equipment in an advanced date comparison", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      epsTestSummary: {
        daily_history: {
          latest_date: "2026-11-25",
          entries: [
            { date: "2026-11-23", cumulative_passed_equipment: ["OLD-ITEM"] },
            { date: "2026-11-24", cumulative_passed_equipment: ["OLD-ITEM", "PRIOR-ITEM"] },
            { date: "2026-11-25", cumulative_passed_equipment: ["OLD-ITEM", "PRIOR-ITEM", "IAD06-NEW-ITEM"] },
          ],
        },
      },
      epsTestItems: [
        { equipment_key: "OLD-ITEM", item_status: "Passed" },
        { equipment_key: "PRIOR-ITEM", item_status: "Passed" },
        { equipment_key: "NEW-ITEM", item_status: "Fixed - Not In Tracker" },
      ],
    });

    render(
      <MemoryRouter>
        <EpsTestExecutionPage data={data} />
      </MemoryRouter>,
    );

    await expandExecutionTables(user);
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.selectOptions(screen.getByLabelText("Baseline"), "2026-11-24");
    await user.click(screen.getByRole("button", { name: /New Passed/ }));

    expect(screen.getByText("NEW-ITEM")).toBeInTheDocument();
    expect(screen.queryByText("OLD-ITEM")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIOR-ITEM")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide Advanced" }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByLabelText("Baseline")).toHaveValue("2026-11-24");
  });
});
