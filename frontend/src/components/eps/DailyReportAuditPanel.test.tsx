import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EpsDailyReportAudit, EpsDailyReportEvent, EpsDailyReportItem } from "../../types/data";
import { DailyReportAuditPanel } from "./DailyReportAuditPanel";

function event(date: string, source: EpsDailyReportEvent["source"], status: EpsDailyReportEvent["status"]): EpsDailyReportEvent {
  return { date, source, status, report_name: `${date}.md`, line_number: 2, date_basis: "filename" };
}
function item(id: string, events: EpsDailyReportEvent[]): EpsDailyReportItem {
  const dates = [...new Set(events.map((entry) => entry.date))];
  return {
    equipment_key: id, events, test_dates: dates, repeated_on_different_dates: dates.length > 1,
    repeated_on_same_day: events.length > dates.length, cross_source: new Set(events.map((entry) => entry.source)).size > 1,
    test_tracking_required: true, pdm_name: null, module_equipment: null, module_match_status: "unmatched",
  };
}
const audit: EpsDailyReportAudit = {
  sources: {
    Daily_test_report: { available: true, report_count: 1, event_count: 2, files: [], skipped_files: [] },
    MV_Daily_test_report: { available: true, report_count: 2, event_count: 3, files: [], skipped_files: [] },
  },
  item_count: 3, event_count: 5, repeated_item_count: 1, same_day_item_count: 1,
  items: [
    item("TX6-REPEAT", [event("2026-10-01", "Daily_test_report", "failed"), event("2026-10-03", "MV_Daily_test_report", "retested_and_passed")]),
    item("TX6-SAME", [event("2026-10-03", "Daily_test_report", "tested"), event("2026-10-03", "MV_Daily_test_report", "tested_and_passed")]),
    item("TX6-SINGLE", [event("2026-10-04", "MV_Daily_test_report", "tested_and_passed")]),
  ],
};

describe("DailyReportAuditPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T16:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("filters repeated dates and shows the original failure and later retest evidence", async () => {
    const user = userEvent.setup();
    render(<DailyReportAuditPanel audit={audit} />);
    expect(screen.queryByRole("option", { name: "All daily items" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Repeat review")).toHaveValue("all");
    expect(screen.queryByRole("columnheader", { name: "PDM / Equipment" })).not.toBeInTheDocument();
    expect(screen.queryByText("TX6-SINGLE")).not.toBeInTheDocument();
    expect(screen.getByText("TX6-SAME")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Repeat review"), "dates");
    expect(screen.queryByText("TX6-SAME")).not.toBeInTheDocument();
    const row = screen.getByText("TX6-REPEAT").closest("tr")!;
    expect(within(row).getByText("2026-10-01")).toBeInTheDocument();
    expect(within(row).getByText("2026-10-03")).toBeInTheDocument();
    await user.click(within(row).getByText("Report history (2 entries)"));
    expect(within(row).getByText("2026-10-01 · Failed")).toBeVisible();
    expect(within(row).getByText("2026-10-03 · Retested and Passed")).toBeVisible();
    expect(within(row).getByText("legacy · Legacy EPS Daily Report / 2026-10-01.md · line 2")).toBeVisible();
  });

  it("separates same-day entries and retains complete history under source and date filters", async () => {
    const user = userEvent.setup();
    render(<DailyReportAuditPanel audit={audit} />);
    await user.selectOptions(screen.getByLabelText("Repeat review"), "sameDay");
    expect(screen.getByText("TX6-SAME")).toBeInTheDocument();
    expect(screen.queryByText("TX6-REPEAT")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset daily review" }));
    await user.selectOptions(screen.getByLabelText("Repeat review"), "crossSource");
    await user.selectOptions(screen.getByLabelText("Report source"), "MV_Daily_test_report");
    await user.clear(screen.getByLabelText("Repeat date through"));
    await user.type(screen.getByLabelText("Repeat date through"), "2026-10-03");
    expect(screen.queryByText("TX6-SINGLE")).not.toBeInTheDocument();
    const row = screen.getByText("TX6-REPEAT").closest("tr")!;
    expect(within(row).getByText("2026-10-01")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search repeated items"), "TX6-SAME");
    expect(screen.queryByText("TX6-REPEAT")).not.toBeInTheDocument();
    expect(screen.getByText("TX6-SAME")).toBeInTheDocument();
  });

  it("defaults to seven days, excludes first-only and future repeats, and resets to the recent window", async () => {
    vi.setSystemTime(new Date("2026-10-26T16:00:00Z"));
    const user = userEvent.setup();
    const records = [
      item("TX6-BOUNDARY", [event("2026-10-01", "Daily_test_report", "failed"), event("2026-10-20", "MV_Daily_test_report", "retested_and_passed")]),
      item("TX6-TODAY", [event("2026-10-02", "Daily_test_report", "tested"), event("2026-10-26", "Daily_test_report", "tested")]),
      item("TX6-OLD", [event("2026-10-10", "Daily_test_report", "tested"), event("2026-10-19", "Daily_test_report", "tested")]),
      item("TX6-ONCE", [event("2026-10-22", "Daily_test_report", "tested")]),
      item("TX6-FUTURE-REPEAT", [event("2026-10-25", "Daily_test_report", "tested"), event("2026-10-27", "Daily_test_report", "tested")]),
    ];
    render(<DailyReportAuditPanel audit={{ ...audit, items: records }} />);
    expect(screen.getByLabelText("Repeat date from")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText("Repeat date through")).toHaveValue("2026-10-26");
    expect(screen.getByText("TX6-BOUNDARY")).toBeInTheDocument();
    expect(screen.getByText("TX6-TODAY")).toBeInTheDocument();
    expect(screen.queryByText("TX6-OLD")).not.toBeInTheDocument();
    expect(screen.queryByText("TX6-ONCE")).not.toBeInTheDocument();
    expect(screen.queryByText("TX6-FUTURE-REPEAT")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("TX6-TODAY");
    const row = screen.getByText("TX6-BOUNDARY").closest("tr")!;
    expect(within(row).getByText("2026-10-01")).toBeInTheDocument();
    await user.click(within(row).getByText("Report history (2 entries)"));
    expect(within(row).getByText("2026-10-01 · Failed")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Report source"), "Daily_test_report");
    expect(screen.queryByText("TX6-BOUNDARY")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Report source"), "");
    await user.click(screen.getByRole("button", { name: "All repeat history" }));
    expect(screen.getByText("TX6-OLD")).toBeInTheDocument();
    expect(screen.queryByText("TX6-ONCE")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset daily review" }));
    expect(screen.getByLabelText("Repeat date from")).toHaveValue("2026-10-20");
    expect(screen.queryByText("TX6-OLD")).not.toBeInTheDocument();
  });

  it("uses the project Eastern calendar date for its recent shortcut", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
    render(<DailyReportAuditPanel audit={audit} />);
    await user.click(screen.getByRole("button", { name: /Repeated in last 7 days/ }));
    expect(screen.getByLabelText("Repeat date from")).toHaveValue("2026-10-19");
    expect(screen.getByLabelText("Repeat date through")).toHaveValue("2026-10-25");
    expect(screen.getByText("No repeated test items match these filters.")).toBeInTheDocument();
  });

  it("shows ten records per page and returns to page one when filters change", async () => {
    const user = userEvent.setup();
    const records = Array.from({ length: 12 }, (_, index) => item(`TX6-PAGE-${String(index + 1).padStart(2, "0")}`, [
      event("2026-09-01", "Daily_test_report", "tested"),
      event("2026-10-03", "Daily_test_report", "tested"),
    ]));
    render(<DailyReportAuditPanel audit={{ ...audit, items: records }} />);
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("TX6-PAGE-10")).toBeInTheDocument();
    expect(screen.queryByText("TX6-PAGE-11")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2 · 10 per page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("TX6-PAGE-11")).toBeInTheDocument();
    expect(screen.getByText("TX6-PAGE-12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Search repeated items"), "TX6-PAGE-01");
    expect(screen.getByText("TX6-PAGE-01")).toBeInTheDocument();
    expect(screen.getByText("Page 1 / 1 · 10 per page")).toBeInTheDocument();
  });

  it("filters cross-site repeats and site while retaining failures, same-day duplicates and full older history", async () => {
    const user = userEvent.setup();
    const records = [
      item("TX6-CROSS", [event("2025-01-01", "Offsite_Test_Report", "tested_and_passed"), event("2026-10-03", "Onsite_Test_Report", "failed"), event("2026-10-04", "Onsite_Test_Report", "retested_and_passed")]),
      item("TX6-LINES", [event("2026-10-03", "Onsite_Test_Report", "tested"), { ...event("2026-10-03", "Onsite_Test_Report", "tested"), line_number: 3 }]),
      item("TX6-CROSS-CT01", [event("2026-10-03", "Onsite_Test_Report", "tested")]),
    ];
    render(<DailyReportAuditPanel audit={{ ...audit, items: records }} />);
    expect(screen.getByText("TX6-LINES")).toBeInTheDocument();
    expect(screen.queryByText("TX6-CROSS-CT01")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Repeat review"), "crossSite");
    expect(screen.queryByText("TX6-LINES")).not.toBeInTheDocument();
    expect(screen.getByText("Cross-site repeat")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Test site"), "onsite");
    const row = screen.getByText("TX6-CROSS").closest("tr")!;
    await user.click(within(row).getByText("Report history (3 entries)"));
    expect(within(row).getByText("2025-01-01 · Tested / Passed")).toBeVisible();
    expect(within(row).getByText("2026-10-03 · Failed")).toBeVisible();
    expect(within(row).getByText(/offsite · Offsite Test Report/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "All repeat history" }));
    await user.selectOptions(screen.getByLabelText("Test site"), "offsite");
    expect(screen.getByText("TX6-CROSS")).toBeInTheDocument();
  });

  it("reports unavailable data and source coverage instead of presenting false zeroes", () => {
    const { rerender } = render(<DailyReportAuditPanel audit={null} />);
    expect(screen.getByText(/Daily report review data is unavailable/)).toBeInTheDocument();
    rerender(<DailyReportAuditPanel audit={{ ...audit, sources: {
      ...audit.sources, MV_Daily_test_report: { available: false, report_count: 0, event_count: 0, files: [], skipped_files: ["notes.md"] },
    } }} />);
    expect(screen.getByText("Source directory unavailable")).toBeInTheDocument();
    expect(screen.getByText("Skipped undated files: notes.md")).toBeInTheDocument();
  });
});
