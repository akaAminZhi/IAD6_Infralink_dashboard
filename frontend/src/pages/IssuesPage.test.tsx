import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import type { KprSummary } from "../types/data";
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

  it("applies combined open and overdue filters from an Overview URL", () => {
    const data = makeDashboardData({
      cases: [
        {
          case_id: "CASE-OVERDUE",
          equipment_id: "EQ-1",
          status: "Open",
          due_date: "2020-01-01",
        },
        {
          case_id: "CASE-NO-DUE",
          equipment_id: "EQ-2",
          status: "Open",
          due_date: null,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/issues?openOnly=1&dueState=Overdue"]}>
        <IssueAttachmentManifestProvider manifest={null}>
          <NetaReportManifestProvider manifest={null}>
            <IssuesPage data={data} />
          </NetaReportManifestProvider>
        </IssueAttachmentManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("CASE-OVERDUE")).toBeInTheDocument();
    expect(screen.queryByText("CASE-NO-DUE")).not.toBeInTheDocument();
  });

  it("groups Open and Acknowledged as one open-issue filter", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      cases: [
        { case_id: "CASE-OPEN", equipment_id: "EQ-1", status: "Open" },
        { case_id: "CASE-ACK", equipment_id: "EQ-2", status: "Acknowledged" },
        { case_id: "CASE-RESOLVED", equipment_id: "EQ-3", status: "Resolved" },
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

    await user.click(screen.getByRole("button", { name: "Open 2 - 67%" }));

    expect(screen.getByText("CASE-OPEN")).toBeInTheDocument();
    expect(screen.getByText("CASE-ACK")).toBeInTheDocument();
    expect(screen.queryByText("CASE-RESOLVED")).not.toBeInTheDocument();
  });

  it("applies an exact KPR issue cohort", () => {
    const data = makeDashboardData({
      cases: [
        { case_id: "CASE-IN", equipment_id: "EQ-1", status: "Open" },
        { case_id: "CASE-OUT", equipment_id: "EQ-2", status: "Open" },
      ],
      kprSummary: {
        issue_performance: { current_open_case_ids: ["CASE-IN"] },
      } as unknown as KprSummary,
    });

    render(
      <MemoryRouter initialEntries={["/issues?kprFilter=currentOpen"]}>
        <IssueAttachmentManifestProvider manifest={null}>
          <NetaReportManifestProvider manifest={null}>
            <IssuesPage data={data} />
          </NetaReportManifestProvider>
        </IssueAttachmentManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("CASE-IN")).toBeInTheDocument();
    expect(screen.queryByText("CASE-OUT")).not.toBeInTheDocument();
  });
});
