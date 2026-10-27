import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSiteDailyReports, saveSiteDailyReport } from "../../utils/automationApi";
import type { SiteDailyReport } from "../../types/automation";
import { SiteDailyReportsPanel } from "./SiteDailyReportsPanel";

vi.mock("../../utils/automationApi", () => ({ getSiteDailyReports: vi.fn(), saveSiteDailyReport: vi.fn() }));
const existing: SiteDailyReport = {
  report_name: "2026-10-27.md", site: "onsite", modified_at: "2026-10-27T12:00:00Z",
  sections: { tested_and_passed: ["TX6-01", "TX6-01"], failed: [], retested_and_passed: [] },
  counts: { tested_and_passed: 2, failed: 0, retested_and_passed: 0 },
};
describe("SiteDailyReportsPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSiteDailyReports).mockImplementation(async (site) => site === "onsite" ? [existing] : []);
    vi.mocked(saveSiteDailyReport).mockResolvedValue({ report: existing, wash_run: null, rebuild_error: null });
  });
  it("preserves repeated lines and confirms replacement only within the same site", async () => {
    const user = userEvent.setup();
    render(<SiteDailyReportsPanel serviceBusy={false} onSaved={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Tested")).toHaveValue("TX6-01\nTX6-01");
    expect(within(dialog).queryByText("Partially Tested")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save Report" }));
    expect(saveSiteDailyReport).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Confirm overwrite" }));
    await waitFor(() => expect(saveSiteDailyReport).toHaveBeenCalledWith("onsite", existing.report_name, expect.objectContaining({ tested_and_passed: "TX6-01\nTX6-01", overwrite: true })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "New Offsite Daily Report" }));
    await user.clear(screen.getByLabelText("Report date"));
    await user.type(screen.getByLabelText("Report date"), "2026-10-27");
    await user.type(screen.getByLabelText("Tested"), "TX6-01\nTX6-01");
    await user.click(screen.getByRole("button", { name: "Save Report" }));
    await waitFor(() => expect(saveSiteDailyReport).toHaveBeenCalledWith("offsite", existing.report_name, expect.objectContaining({ overwrite: false })));
  });
  it("keeps a failed save available for retry and explains a saved report with rebuild failure", async () => {
    const user = userEvent.setup();
    vi.mocked(saveSiteDailyReport).mockRejectedValueOnce(new Error("Service busy"));
    render(<SiteDailyReportsPanel serviceBusy={false} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "New Offsite Daily Report" }));
    await user.type(screen.getByLabelText("Failed"), "TX6-02");
    await user.click(screen.getByRole("button", { name: "Save Report" }));
    expect(await screen.findByText("Service busy")).toBeInTheDocument();
    expect(screen.getByLabelText("Failed")).toHaveValue("TX6-02");
    vi.mocked(saveSiteDailyReport).mockResolvedValue({ report: existing, wash_run: null, rebuild_error: "Worker unavailable" });
    await user.click(screen.getByRole("button", { name: "Save Report" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Report saved. Summary rebuild could not start");
  });
  it("disables new entries during an active job", () => {
    render(<SiteDailyReportsPanel serviceBusy onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: "New Onsite Daily Report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Offsite Daily Report" })).toBeDisabled();
  });
  it("shows the latest report first and browses five per page with independent site selection", async () => {
    const user = userEvent.setup();
    const onsite = Array.from({ length: 8 }, (_, index) => ({ ...existing, report_name: `2026-10-${27 - index}.md` }));
    const offsite = Array.from({ length: 6 }, (_, index) => ({ ...existing, site: "offsite" as const, report_name: `2026-09-${30 - index}.md` }));
    vi.mocked(getSiteDailyReports).mockImplementation(async (site) => site === "onsite" ? onsite : offsite);
    render(<SiteDailyReportsPanel serviceBusy={false} onSaved={vi.fn()} />);
    expect(await screen.findByText(onsite[0].report_name)).toBeVisible();
    expect(screen.queryByText(onsite[1].report_name)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next site report page" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Browse All (8)" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("Page 1 of 2 / 8 reports")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous site report page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next site report page" }));
    expect(screen.getByText(onsite[5].report_name)).toBeVisible();
    expect(screen.queryByText(onsite[0].report_name)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next site report page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Offsite Reports (6)" }));
    expect(screen.getByText("Page 1 of 2 / 6 reports")).toBeVisible();
    expect(screen.getByText(offsite[0].report_name)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show Latest Only" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText(offsite[1].report_name)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse All (6)" })).toBeVisible();
  });
});
