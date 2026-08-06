import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { OverviewPage } from "./OverviewPage";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function overviewData() {
  return makeDashboardData({
    pdms: [
      {
        pdm_name: "IAD06-PDM-E6-220-01-MDB",
        equipment_count: 1,
        equipment: [
          {
            equipment_id: "IAD06-MDB6-01A",
            neta_complete: false,
            cases: [
              {
                case_id: "CASE-OPEN",
                equipment_id: "IAD06-MDB6-01A",
                status: "Open",
                issue_image: "issue.jpg",
              },
            ],
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
}

describe("OverviewPage", () => {
  it("navigates readiness metrics with the intended PDM filter", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <Routes>
          <Route
            path="/overview"
            element={<OverviewPage data={overviewData()} />}
          />
          <Route path="/pdms" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Testing Started/i }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/pdms?quickFilter=testingStarted",
    );
  });

  it("navigates management exceptions with an applied EPS status filter", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <Routes>
          <Route path="/overview" element={<OverviewPage data={overviewData()} />} />
          <Route path="/eps-test-execution" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /Waiting Infralink NETA completion/i }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/eps-test-execution?status=Complete%2C%20Waiting%20Infralink%20NETA%20Completion",
    );
  });

  it("opens a PDM action detail over Overview without changing routes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <NetaReportManifestProvider manifest={null}>
          <OverviewPage data={overviewData()} />
          <LocationProbe />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("cell", { name: "IAD06-PDM-E6-220-01-MDB" }),
    );
    expect(screen.getByText("Equipment Under This PDM")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/overview");
  });
});
