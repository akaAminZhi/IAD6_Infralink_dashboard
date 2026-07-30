import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { IssuesPage } from "./IssuesPage";

describe("IssuesPage", () => {
  it("combines PDM and CT/CTS summary filters and supports export exclusions", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      cases: [
        {
          case_id: "CASE-CT",
          equipment_id: "IAD06-EQ-CT",
          status: "Open",
          priority: "High",
          summary: "PRIMARY SIDE CTS A AND C PHASE RATIO OUT OF TOLERANCE",
          issue_image: "issue.jpg",
        },
        {
          case_id: "CASE-MOTOR",
          equipment_id: "IAD06-EQ-MOTOR",
          status: "Open",
          priority: "Normal",
          summary: "Motor malfunction",
          issue_image: "motor.jpg",
        },
      ],
      pdms: [
        {
          pdm_name: "IAD06-PDM-E6-210-01",
          equipment: [{ equipment_id: "IAD06-EQ-CT" }],
        },
        {
          pdm_name: "IAD06-PDM-E6-110-01",
          equipment: [{ equipment_id: "IAD06-EQ-MOTOR" }],
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/issues"]}>
        <IssueAttachmentManifestProvider manifest={null}>
          <NetaReportManifestProvider manifest={null}>
            <IssuesPage data={data} />
          </NetaReportManifestProvider>
        </IssueAttachmentManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("CASE-CT")).toBeInTheDocument();
    expect(screen.getByText("CASE-MOTOR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search & Filters" }));
    await user.type(screen.getByLabelText("Search by PDM Name"), "210");
    await user.type(screen.getByLabelText("Search Summary"), "ct");

    expect(screen.getByText("CASE-CT")).toBeInTheDocument();
    expect(screen.queryByText("CASE-MOTOR")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Exclude CASE-CT from table and export",
      }),
    );
    expect(screen.queryByText("CASE-CT")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore 1" }));
    expect(screen.getByText("CASE-CT")).toBeInTheDocument();
  });
});
