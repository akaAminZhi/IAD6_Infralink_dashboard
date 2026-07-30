import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DailyReport, SavedDailyReport } from "../../types/automation";
import {
  saveDailyReport,
  validateDailyReport,
} from "../../utils/automationApi";
import { DailyReportDialog } from "./DailyReportDialog";

vi.mock("../../utils/automationApi", () => {
  class MockAutomationApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    AutomationApiError: MockAutomationApiError,
    saveDailyReport: vi.fn(),
    validateDailyReport: vi.fn(),
  };
});

const validation = {
  sections: {
    failed: ["PDU6-01A-1-CT"],
    retested_and_passed: [],
    tested: ["PDU6-01A-2-CT"],
  },
  counts: { failed: 1, retested_and_passed: 0, tested: 1 },
  warnings: [],
};

const saved: SavedDailyReport = {
  report: {
    report_name: "7-30.md",
    modified_at: "2026-07-30T08:00:00",
    sections: validation.sections,
    counts: validation.counts,
  },
  validation,
  wash_run: {
    run_id: "wash-1",
    kind: "job",
    label: "Rebuild Daily Test Summary",
    status: "queued",
    created_at: "2026-07-30T08:00:00",
    started_at: null,
    finished_at: null,
    exit_code: null,
    error: null,
    current_step: null,
    options: {},
    steps: [],
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("DailyReportDialog", () => {
  it("cleans list counts locally, warns about cross-section duplicates, and saves", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(validateDailyReport).mockResolvedValue(validation);
    vi.mocked(saveDailyReport).mockResolvedValue(saved);

    render(
      <DailyReportDialog
        existingReportNames={[]}
        initialReport={null}
        onClose={vi.fn()}
        onSaved={onSaved}
        open
        serviceBusy={false}
      />,
    );

    await user.clear(screen.getByLabelText("Report file name"));
    await user.type(screen.getByLabelText("Report file name"), "7-30");
    await user.type(
      screen.getByPlaceholderText("PDU6-02D-3-CT-PRI"),
      "- PDU6-01A-1-CT{enter}- PDU6-01A-1-CT",
    );
    await user.type(
      screen.getByPlaceholderText("PDU6-02D-1-PQM1-CT01"),
      "PDU6-01A-1-CT{enter}PDU6-01A-2-CT",
    );

    expect(screen.getByText("1 cross-section duplicate")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save Report" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(validateDailyReport).toHaveBeenCalledWith({
      failed: "- PDU6-01A-1-CT\n- PDU6-01A-1-CT",
      retested_and_passed: "",
      tested: "PDU6-01A-1-CT\nPDU6-01A-2-CT",
    });
    expect(saveDailyReport).toHaveBeenCalledWith(
      "7-30",
      expect.objectContaining({ overwrite: false }),
    );
  });

  it("requires explicit confirmation before replacing an existing report", async () => {
    const user = userEvent.setup();
    const existing: DailyReport = {
      report_name: "7-30.md",
      modified_at: "2026-07-30T08:00:00",
      sections: { failed: [], retested_and_passed: [], tested: ["EQ-1"] },
      counts: { failed: 0, retested_and_passed: 0, tested: 1 },
    };
    vi.mocked(validateDailyReport).mockResolvedValue(validation);
    vi.mocked(saveDailyReport).mockResolvedValue(saved);

    render(
      <DailyReportDialog
        existingReportNames={["7-30.md"]}
        initialReport={existing}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        serviceBusy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Report" }));
    expect(screen.getByText("Replace existing report?")).toBeInTheDocument();
    expect(saveDailyReport).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Replace Report" }));
    await waitFor(() =>
      expect(saveDailyReport).toHaveBeenCalledWith(
        "7-30.md",
        expect.objectContaining({ overwrite: true }),
      ),
    );
  });

  it("does not render while closed", () => {
    render(
      <DailyReportDialog
        existingReportNames={[]}
        initialReport={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open={false}
        serviceBusy={false}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
