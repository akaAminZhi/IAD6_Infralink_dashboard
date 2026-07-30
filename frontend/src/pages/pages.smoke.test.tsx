import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { DataQualityPage } from "./DataQualityPage";
import { EquipmentPage } from "./EquipmentPage";
import { EpsTestExecutionPage } from "./EpsTestExecutionPage";
import { IssuesPage } from "./IssuesPage";
import { OverviewPage } from "./OverviewPage";
import { PdmPage } from "./PdmPage";
import { PowerPlanPage } from "./PowerPlanPage";

function renderPage(element: ReactElement, initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          {element}
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>
    </MemoryRouter>,
  );
}

describe("dashboard page empty states", () => {
  it.each([
    ["Overview", <OverviewPage data={makeDashboardData()} />, "No PDM dataset found"],
    ["PDMs", <PdmPage data={makeDashboardData()} />, "No PDM data found."],
    ["Equipment", <EquipmentPage data={makeDashboardData()} />, "No equipment data found."],
    ["Issues", <IssuesPage data={makeDashboardData()} />, "No issue data found."],
    [
      "EPS execution",
      <EpsTestExecutionPage data={makeDashboardData()} />,
      "No EPS test execution data found.",
    ],
    ["Power plan", <PowerPlanPage data={makeDashboardData()} />, "No PDM equipment data found."],
    [
      "Data quality",
      <DataQualityPage data={makeDashboardData()} />,
      "No data quality inputs loaded.",
    ],
  ])("renders the %s recovery state without crashing", (_name, element, expectedText) => {
    renderPage(element);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});

describe("PDM page interaction", () => {
  it("opens and closes the selected PDM detail without clearing the page", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "IAD06-PDM-E6-220-01-MDB",
          equipment_count: 1,
          equipment: [
            {
              equipment_id: "IAD06-MDB6-01A",
              source_equipment_label: "MDB6-01A",
              neta_complete: false,
              cases: [],
            },
          ],
        },
      ],
      epsPdmExecution: [
        {
          pdm_name: "IAD06-PDM-E6-220-01-MDB",
          completed_test_item_count: 1,
          tracker_item_count: 2,
        },
      ],
    });
    renderPage(<PdmPage data={data} />, "/pdms");

    await user.click(
      screen.getByRole("cell", { name: "IAD06-PDM-E6-220-01-MDB" }),
    );
    expect(screen.getByText("Equipment Under This PDM")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close PDM detail" }));
    expect(screen.queryByText("Equipment Under This PDM")).not.toBeInTheDocument();
    expect(screen.getByText("PDM Readiness Table")).toBeInTheDocument();
  });
});
