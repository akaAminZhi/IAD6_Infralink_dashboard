import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNetaReportReviewCache } from "../utils/automationApi";
import { clearPublishedNetaReviewCache } from "../utils/loadNetaReportReviews";

import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { InfralinkEquipmentLinksProvider } from "../contexts/InfralinkEquipmentLinksContext";
import { CxalloyEquipmentLinksProvider } from "../contexts/CxalloyEquipmentLinksContext";
import { makeDashboardData } from "../test/fixtures";
import type { KprSummary } from "../types/data";
import { EquipmentPage } from "./EquipmentPage";

describe("EquipmentPage", () => {
  it.each(["/equipment", "/equipment?quickFilter=cxalloyPending"])("limits the pending upload card and filter to complete equipment with pending PDFs (%s)", async (path) => {
    const user = userEvent.setup();
    const entries = [
      { id: "EQ-PENDING", complete: true, status: "pending" as const },
      { id: "IAD06-TX-UPP6-01A", complete: true, status: "pending" as const },
      { id: "IAD06-UPP6-01A", complete: true, status: "pending" as const },
      { id: "EQ-INCOMPLETE", complete: false, status: "pending" as const },
      { id: "EQ-UNKNOWN", complete: null, status: "pending" as const },
      { id: "EQ-REVIEW", complete: true, status: "review_required" as const },
      { id: "EQ-MISSING", complete: true, status: "missing_pdf" as const },
      { id: "EQ-UPLOADED", complete: true, status: "uploaded" as const },
    ];
    const data = makeDashboardData({ pdms: [],
      equipment: entries.map((entry) => ({ equipment_id: entry.id, neta_complete: entry.complete, neta_test_report: "Report.pdf" })),
      cxalloyReportStatus: { records: entries.map((entry) => ({ equipment_id: entry.id, upload_status: "pending", reports: [
        { report_name: "Report.pdf", report_kind: "equipment", upload_status: entry.status },
      ] })) },
    });
    render(<MemoryRouter initialEntries={[path]}><EquipmentPage data={data} /></MemoryRouter>);
    const card = screen.getByText("Pending CxAlloy Upload").closest("button")!;
    expect(card).toHaveTextContent("1");
    if (path === "/equipment") await user.click(card);
    expect(screen.getByRole("cell", { name: "EQ-PENDING" })).toBeInTheDocument();
    for (const entry of entries.slice(1)) expect(screen.queryByRole("cell", { name: entry.id })).not.toBeInTheDocument();
  });

  beforeEach(() => {
    clearNetaReportReviewCache();
    clearPublishedNetaReviewCache();
  });
  afterEach(() => vi.restoreAllMocks());
  it("switches report names with a separate button and uses the report count only to expand or collapse", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      pdms: [],
      equipment: [{ equipment_id: "EQ-REPORTS", neta_test_report: "Original-1.pdf; Original-2.pdf" }],
      netaReportManifest: { records: [
        { source_key: "downloaded", report_name: "Original-1.pdf", url: "/neta-reports/Original-1.pdf" },
        { source_key: "gc", source_report_name: "Original-1.pdf", report_name: "GC-Equipment-Report.pdf", url: "/gc-reports/GC-Equipment-Report.pdf" },
        { source_key: "downloaded", report_name: "Original-2.pdf", url: "/neta-reports/Original-2.pdf" },
      ] },
    });
    render(<MemoryRouter><NetaReportManifestProvider manifest={data.netaReportManifest}><EquipmentPage data={data} /></NetaReportManifestProvider></MemoryRouter>);
    const row = screen.getByRole("cell", { name: "EQ-REPORTS" }).closest("tr")!;
    const reports = () => within(row).getByRole("button", { name: "2 reports" });
    expect(within(row).queryByRole("button", { name: "Show GC report names" })).not.toBeInTheDocument();

    await user.click(reports());
    expect(within(row).getByRole("button", { name: "Original-1.pdf" })).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Show GC report names" }));
    expect(reports()).toHaveAttribute("aria-expanded", "true");
    expect(within(row).queryByRole("button", { name: "Original-1.pdf" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Original-2.pdf" })).toBeInTheDocument();
    expect(screen.queryByText("Asset Information")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "GC-Equipment-Report.pdf" }));
    expect(document.querySelector('iframe[title="GC-Equipment-Report.pdf"]')).toHaveAttribute("src", "/gc-reports/GC-Equipment-Report.pdf");
    await user.click(screen.getByRole("button", { name: "Close NETA report preview" }));
    await user.click(within(row).getByRole("button", { name: "Show original report names" }));
    expect(within(row).getByRole("button", { name: "Original-1.pdf" })).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Show GC report names" }));
    await user.click(reports());
    expect(reports()).toHaveAttribute("aria-expanded", "false");
    expect(within(row).queryByRole("button", { name: "Show original report names" })).not.toBeInTheDocument();
    await user.click(reports());
    expect(within(row).getByRole("button", { name: "Original-1.pdf" })).toBeInTheDocument();
  });

  it("shows cable ATP completion consistently in table, summary, filters and details", async () => {
    const user = userEvent.setup();
    const cableId = "FDR-IAD06-MDS6-01B-IAD06-CH607-01B";
    const data = makeDashboardData({ pdms: [], equipment: [
      { equipment_id: cableId, equipment_type: "Feeder Cable - LV", neta_complete: false, feeder_cable_atp: "Cable ATP.pdf" },
      { equipment_id: "FDR-MISSING", equipment_type: "Feeder Cable - MV", neta_complete: true },
      { equipment_id: "FDR-UNTESTED", equipment_type: "Feeder Cable - LV", neta_complete: false, status: "L3: Pre Func Testing & Startup" },
    ] });
    render(<MemoryRouter><NetaReportManifestProvider manifest={null}><EquipmentPage data={data} /></NetaReportManifestProvider></MemoryRouter>);
    const row = screen.getByRole("cell", { name: cableId }).closest("tr")!;
    expect(within(row).getByText("Complete + Report Available")).toBeInTheDocument();
    expect(within(row).queryByText("NETA incomplete")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "1 reports" }));
    expect(within(row).getByRole("region", { name: "Cable completion evidence" })).toHaveTextContent("Cable ATP.pdf");
    await user.click(within(row).getByRole("button", { name: "1 reports" }));
    const complete = screen.getByText("NETA Complete With Report").closest("button")!;
    expect(complete).toHaveTextContent("1");
    await user.click(complete);
    expect(screen.getByRole("cell", { name: cableId })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "FDR-UNTESTED" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "FDR-MISSING" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("cell", { name: cableId }));
    expect(screen.getByRole("region", { name: "Cable completion evidence" })).toHaveTextContent("Attached in Infralink");
    expect(screen.getAllByText("Complete + Report Available")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Close equipment detail" }));
    await user.click(screen.getByText("Missing NETA Report").closest("button")!);
    expect(screen.getByRole("cell", { name: "FDR-MISSING" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: cableId })).not.toBeInTheDocument();
  });

  it("places ordinary equipment first during search while retaining column sort order for equal-length IDs", async () => {
    const user = userEvent.setup();
    const cableId = "FDR-IAD06-EQ-1-IAD06-EQ-2";
    const regularIds = ["IAD06-EQ-1", "IAD06-EQ-2"];
    const data = makeDashboardData({
      pdms: [],
      equipment: [
        { equipment_id: cableId, equipment_type: "Feeder Cable - LV", open_issues_count_from_system_elements: 9 },
        { equipment_id: cableId + "-A", equipment_type: "tErMiNaTiOn", open_issues_count_from_system_elements: 8 },
        ...regularIds.map((equipment_id) => ({ equipment_id, equipment_type: "Switchgear" })),
      ],
    });
    render(<MemoryRouter><NetaReportManifestProvider manifest={null}><EquipmentPage data={data} /></NetaReportManifestProvider></MemoryRouter>);
    const ids = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(ids()[0]).toBe(cableId);
    expect(screen.getByRole("button", { name: "More filters" })).toHaveAttribute("aria-expanded", "false");
    const search = screen.getByPlaceholderText("Search equipment ID or source label");
    await user.type(search, "eq");
    await waitFor(() => expect(ids().slice(0, 2)).toEqual(regularIds));
    expect(ids().slice(2)).toEqual([cableId, cableId + "-A"]);
    await user.click(screen.getByRole("button", { name: "Equipment ID" }));
    await user.click(screen.getByRole("button", { name: "Equipment ID" }));
    expect(ids().slice(0, 2)).toEqual([...regularIds].reverse());
    expect(ids().slice(2)).toEqual([cableId, cableId + "-A"]);
    await user.clear(search);
    await user.type(search, cableId + "-A");
    await waitFor(() => expect(ids()).toEqual([cableId + "-A"]));
    await user.click(screen.getByRole("button", { name: "Remove Equipment filter" }));
    await waitFor(() => expect(ids()).toHaveLength(4));
    await user.click(screen.getByRole("button", { name: "More filters" }));
    await user.selectOptions(screen.getByLabelText("Equipment Type", { exact: true }), "Switchgear");
    await waitFor(() => expect(ids()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: /More filters/ }));
    expect(screen.queryByLabelText("Equipment Type", { exact: true })).not.toBeInTheDocument();
    expect(ids()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove Equipment type filter" }));
    await waitFor(() => expect(ids()).toHaveLength(4));
  });

  it("ranks shorter equipment IDs first in search and hides numeric-leading inventory labels", async () => {
    const user = userEvent.setup();
    const shortId = "IAD06-TX6-01D";
    const sidecarId = "IAD06-TX6-01C-Sidecar";
    const pullboxId = "IAD06-TX6-01D-PULLBOX";
    const numericLabels = [
      '3/4" Power (Emergency LV 277/480V) -EMT -Set Screw-23',
      '1 1/2" Power (Life Safety 277/480V) -EMT -Set Screw-2',
    ];
    const data = makeDashboardData({ pdms: [], equipment: [
      { equipment_id: sidecarId, open_issues_count_from_system_elements: 9 },
      { equipment_id: pullboxId },
      { equipment_id: shortId },
      ...numericLabels.map((equipment_id) => ({ equipment_id })),
    ] });
    render(<MemoryRouter><NetaReportManifestProvider manifest={null}><EquipmentPage data={data} /></NetaReportManifestProvider></MemoryRouter>);
    const ids = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(ids()[0]).toBe(sidecarId);
    for (const label of numericLabels) {
      expect(screen.queryByRole("cell", { name: label })).not.toBeInTheDocument();
    }
    const search = screen.getByPlaceholderText("Search equipment ID or source label");
    await user.type(search, "TX6");
    await waitFor(() => expect(ids()).toEqual([shortId, sidecarId, pullboxId]));
    await user.clear(search);
    await waitFor(() => expect(ids()[0]).toBe(sidecarId));
    await user.type(search, "Power");
    await waitFor(() => expect(screen.queryByRole("cell")).not.toBeInTheDocument());
  });

  it("searches cables, terminations and other Excel IDs outside PDMs without NETA evidence", async () => {
    const user = userEvent.setup();
    const cableId = "FDR-IAD06-EQ-1-IAD06-EQ-2";
    const data = makeDashboardData({
      pdms: [{ pdm_name: "PDM-A", equipment: [{ equipment_id: "IAD06-EQ-1" }] }],
      equipment: [
        { equipment_id: "IAD06-EQ-1" },
        { equipment_id: cableId, equipment_type: "Feeder Cable - LV", neta_complete: false },
        { equipment_id: "IAD06-TERM-1", equipment_type: "Termination" },
        { equipment_id: "IAD06-INV6-01", test_tracking_required: false },
      ],
      cases: [{ case_id: "CABLE-ISSUE", equipment_id: cableId, status: "Open", issue_image: "evidence.jpg", corrective_images: "repair.jpg" }],
    });
    render(<MemoryRouter><NetaReportManifestProvider manifest={null}><EquipmentPage data={data} /></NetaReportManifestProvider></MemoryRouter>);
    const search = screen.getByPlaceholderText("Search equipment ID or source label");
    for (const id of [cableId, "IAD06-TERM-1", "IAD06-INV6-01"]) {
      await user.clear(search);
      await user.type(search, id.toLowerCase());
      expect(await screen.findByRole("cell", { name: id })).toBeInTheDocument();
      expect(screen.queryByRole("cell", { name: "IAD06-EQ-1" })).not.toBeInTheDocument();
    }
    await user.clear(search);
    await user.type(search, cableId);
    await user.click(await screen.findByRole("cell", { name: cableId }));
    expect(screen.getByText("Asset Information")).toBeInTheDocument();
    expect(screen.getByText("CABLE-ISSUE")).toBeInTheDocument();
  });
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
      cxalloyReportStatus: {
        records: [{
          equipment_id: "IAD06-PDU6-01D-4",
          upload_status: "pending",
          expected_report_count: 2,
          reports: [
            { report_name: "Report-01.pdf", report_kind: "equipment", upload_status: "uploaded" },
            { report_name: "FDR-new.pdf", report_kind: "cable", upload_status: "pending" },
          ],
        }],
      },
    });

    render(
      <MemoryRouter initialEntries={["/equipment"]}>
        <NetaReportManifestProvider manifest={null}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
      { wrapper: ({ children }) => <InfralinkEquipmentLinksProvider records={[
        { equipment_id: "IAD06-PDU6-01D-4", infralink_id: "1301515161" },
      ]}><CxalloyEquipmentLinksProvider records={[
        { equipment_id: "IAD06-PDU6-01D-4", project_id: "49402", cxalloy_id: "77", cxalloy_name: "PDU6-01D-4" },
      ]}>{children}</CxalloyEquipmentLinksProvider></InfralinkEquipmentLinksProvider> },
    );

    expect(screen.getByText("Equipment Lookup Table")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "EPS Status" })).not.toBeInTheDocument();
    const equipmentCell = screen.getByRole("cell", { name: "IAD06-PDU6-01D-4" });
    const row = equipmentCell.closest("tr");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("0");
    expect(within(row!).getByText("Uploaded · 1 file")).toBeInTheDocument();
    expect(within(row!).getByText("Pending · 1 file")).toBeInTheDocument();
    expect(within(row!).queryByText("Pending · 2 files")).not.toBeInTheDocument();

    await user.click(equipmentCell);
    expect(screen.getByText("Asset Information")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Infralink" })).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=1301515161");
    expect(screen.getByRole("link", { name: "Open in CxAlloy" })).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/77");
    expect(screen.getByText("IEM")).toBeInTheDocument();
    expect(screen.getByText("PDU54SHAM")).toBeInTheDocument();
    expect(screen.getByText("J02PDU000-00032")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Equipment Reports" })).queryByText("Pending")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Equipment Reports" })).getAllByText("Uploaded")).toHaveLength(2);
    expect(screen.getByText("FDR-new.pdf").closest("li")).toHaveTextContent("Pending");
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
      if (readOnly && String(input).startsWith("/api/automation")) {
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
    const evidence = screen.getByRole("button", { name: "Evidence for IAD06-EQ-REVIEW - NETA Test Report-01.pdf" });
    expect(evidence).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Page 2: Verify breaker settings.")).not.toBeVisible();
    await user.click(evidence);
    expect(evidence).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Page 2: Verify breaker settings.")).toBeVisible();
    await user.click(evidence);
    expect(screen.getByText("Page 2: Verify breaker settings.")).not.toBeVisible();
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
    await user.click(evidence);
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
      "/api/automation/neta-report-reviews",
      expect.objectContaining({ method: "PUT" }),
    );
    fetchMock.mockRestore();
  });

});
