import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NetaConfirmedFamily, NetaPositionCheck } from "../types/netaPositions";
import { NetaBaselinesPage } from "./NetaBaselinesPage";

const report = (file: string, key: string, status = "PASSED") => ({
  equipment_id: "IAD06-MDS6-01D", file, url: `/neta-reports-gc/${file}`, report_stage: "formal" as const,
  status, key, confidence: "exact" as const, form: "report", source_report_name: null, flags: [],
  referenced_equipment: null, name_source: "gc_name" as const, gc_name_key: key, test_date: null,
});

const payload: NetaPositionCheck = {
  available: true,
  generated_at: "2026-11-20T08:00:00-05:00",
  baseline_revision: 0,
  report_fields_available: false,
  summary: {
    families: 1, families_confirmed: 0, families_draft: 1, equipment: 2,
    nonconforming_equipment: 1, complete_but_nonconforming: 1,
    equipment_by_issue: { missing: 1, failed_only: 1, complete_but_nonconforming: 1 },
  },
  families: [{
    family: "MDS6|A-F", members: ["IAD06-MDS6-01A", "IAD06-MDS6-01D"], member_count: 2,
    neta_complete_count: 2,
    draft: { status: "draft", complete_member_count: 2, positions: ["CDS-PRI", "CDS-SEC"], support: { "CDS-PRI": 2, "CDS-SEC": 1 } },
    confirmed: null, baseline_basis: "draft", baseline_positions: ["CDS-PRI", "CDS-SEC"],
    draft_differs_from_confirmed: false, nonconforming_count: 1,
  }],
  equipment: [
    {
      equipment_id: "IAD06-MDS6-01A", family: "MDS6|A-F", equipment_type: null, neta_complete: true,
      baseline_basis: "draft", report_stage: "formal", report_count: 2, nonconforming: false,
      complete_but_nonconforming: false, issue_counts: {},
      positions: [
        { key: "CDS-PRI", result: "pass", notes: [], reports: ["a.pdf"] },
        { key: "CDS-SEC", result: "pass", notes: [], reports: ["b.pdf"] },
      ],
      extra_reports: [], needs_review_reports: [], reports: [report("a.pdf", "CDS-PRI"), report("b.pdf", "CDS-SEC")],
      exception_note: null,
    },
    {
      equipment_id: "IAD06-MDS6-01D", family: "MDS6|A-F", equipment_type: null, neta_complete: true,
      baseline_basis: "draft", report_stage: "formal", report_count: 1, nonconforming: true,
      complete_but_nonconforming: true, issue_counts: { failed_only: 1, missing: 1, complete_but_nonconforming: 1 },
      positions: [
        { key: "CDS-PRI", result: "failed_only", notes: [], reports: ["IAD06-MDS6-01D/MDS6-01D-CDS-PRICFAILED).pdf"] },
        { key: "CDS-SEC", result: "missing", notes: [], reports: [] },
      ],
      extra_reports: [], needs_review_reports: [],
      reports: [report("IAD06-MDS6-01D/MDS6-01D-CDS-PRICFAILED).pdf", "CDS-PRI", "FAILED")],
      exception_note: null,
    },
  ],
};

function stubFetch(baselines: object | null = { version: 1, revision: 0, families: {}, editable: true }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("neta-position-baselines")) {
      if (!baselines) return { ok: false, status: 503, json: async () => ({}) };
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ version: 1, revision: body.expected_revision + 1, families: {
          "MDS6|A-F": { status: "confirmed", positions: body.positions, exceptions: body.exceptions,
            confirmed_at: "now", confirmed_by: "local_operator" },
        } }) };
      }
      return { ok: true, json: async () => baselines };
    }
    return { ok: true, json: async () => payload };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NetaBaselinesPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the draft matrix and the complete-but-nonconforming list", async () => {
    stubFetch();
    render(<NetaBaselinesPage />);

    expect(await screen.findByText("NETA Position Baselines")).toBeInTheDocument();
    expect(screen.getByText(/No baseline is confirmed yet/)).toBeInTheDocument();
    const failed = screen.getByTitle(/CDS-PRI: failed_only/);
    expect(failed).toHaveAttribute("href", "/neta-reports-gc/IAD06-MDS6-01D/MDS6-01D-CDS-PRICFAILED).pdf");
    expect(screen.getByTitle(/CDS-SEC: missing/)).toHaveTextContent("–");

    await userEvent.click(screen.getByRole("button", { name: "Anomaly list" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("IAD06-MDS6-01D")).toBeInTheDocument();
    expect(within(table).queryByText("IAD06-MDS6-01A")).not.toBeInTheDocument();
    expect(within(table).getByText(/CDS-PRI: FAIL only · CDS-SEC: Missing position/)).toBeInTheDocument();
  });

  it("confirms an edited baseline with the revision that was loaded", async () => {
    const fetchMock = stubFetch();
    render(<NetaBaselinesPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirm baseline/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Remove CDS-SEC" }));
    await userEvent.type(screen.getByLabelText("New position"), "pqm1{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Confirm baseline/ }));
    expect(await screen.findByText(/Baseline confirmed \(revision 1\)/)).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(String(put[0])).toContain("/neta-position-baselines/MDS6%7CA-F");
    const body = JSON.parse(String(put[1]!.body));
    expect(body.expected_revision).toBe(0);
    expect(body.positions.map((position: { key: string }) => position.key)).toEqual(["CDS-PRI", "PQM1"]);
  });

  it("stays read-only when the baseline service is unavailable", async () => {
    stubFetch(null);
    render(<NetaBaselinesPage />);
    expect(await screen.findByText(/Baseline service unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm baseline/ })).toBeDisabled();
  });

  it("links one report in the anomaly list and can remove the saved link before ETL", async () => {
    const familyKey = "MDS6|A-F";
    const equipmentId = "IAD06-MDS6-01D";
    const sha256 = "a".repeat(64);
    const data = structuredClone(payload);
    data.equipment[1].reports[0].sha256 = sha256;
    data.equipment[1].reports[0].suggested_gc_name = "Suggested filename.pdf";
    const family: NetaConfirmedFamily = {
      status: "confirmed", confirmed_at: null, confirmed_by: null,
      positions: ["CDS-PRI", "CDS-SEC"].map((key) => ({ key, aliases: [], optional: false, count: 1 })),
      exceptions: {},
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("neta-position-baselines")) {
        return { ok: true, json: async () => ({ version: 1, editable: true, revision: 0, families: { [familyKey]: family } }) };
      }
      if (String(url).includes("neta-position-links")) {
        const body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({
          version: 1, revision: body.expected_revision + 1, families: { [familyKey]: {
            ...family, report_position_links: body.position ? { [equipmentId]: { [sha256]: body.position } } : {},
          } },
        }) };
      }
      return { ok: true, json: async () => data };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NetaBaselinesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Anomaly list" }));
    await userEvent.click(screen.getByText(equipmentId));
    expect(screen.getByText("Suggested filename.pdf")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Link to position" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Target test position" }), "CDS-SEC");
    await userEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(await screen.findByText("Link to CDS-SEC pending ETL")).toBeInTheDocument();
    expect(screen.queryByText("Suggested filename.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run dashboard ETL" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(await screen.findByText("Suggested filename.pdf")).toBeInTheDocument();

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches.map(([url]) => url)).toEqual([
      expect.stringContaining("/neta-position-links/MDS6%7CA-F"),
      expect.stringContaining("/neta-position-links/MDS6%7CA-F"),
    ]);
    expect(patches.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { equipment_id: equipmentId, sha256, position: "CDS-SEC", expected_revision: 0 },
      { equipment_id: equipmentId, sha256, position: null, expected_revision: 1 },
    ]);
  });

  it("explains a missing dataset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<NetaBaselinesPage />);
    expect(await screen.findByText(/Run the dashboard ETL/)).toBeInTheDocument();
  });
});
