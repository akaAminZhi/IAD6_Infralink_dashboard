import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DailyReport,
  SavedDailyReport,
  SavedMvDailyReport,
} from "../../types/automation";
import {
  saveDailyReport,
  saveMvDailyReport,
  validateDailyReport,
  validateMvDailyReport,
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
    saveMvDailyReport: vi.fn(),
    validateDailyReport: vi.fn(),
    validateMvDailyReport: vi.fn(),
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

const mvValidation = {
  sections: {
    tested_and_passed: ["FD01-IAD06-TX6-01A"],
    partially_tested: ["FD02-IAD06-TX6-01B"],
    failed: [],
    retested_and_passed: [],
  },
  counts: {
    tested_and_passed: 1,
    partially_tested: 1,
    failed: 0,
    retested_and_passed: 0,
  },
  warnings: [],
};

const savedMv: SavedMvDailyReport = {
  report: {
    report_name: "7-30.md",
    modified_at: "2026-07-30T09:00:00",
    sections: mvValidation.sections,
    counts: mvValidation.counts,
  },
  validation: mvValidation,
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

  it("saves MV reports with Partially Tested without starting the EPS wash", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(validateMvDailyReport).mockResolvedValue(mvValidation);
    vi.mocked(saveMvDailyReport).mockResolvedValue(savedMv);

    render(
      <DailyReportDialog
        existingReportNames={[]}
        initialReport={null}
        onClose={vi.fn()}
        onSaved={onSaved}
        open
        reportKind="mv"
        serviceBusy={false}
      />,
    );

    await user.clear(screen.getByLabelText("Report file name"));
    await user.type(screen.getByLabelText("Report file name"), "7-30");
    await user.type(
      screen.getByPlaceholderText("FD01-IAD06-TX6-01A"),
      "FD01-IAD06-TX6-01A",
    );
    await user.type(
      screen.getByPlaceholderText("FD02-IAD06-TX6-01B"),
      "FD02-IAD06-TX6-01B",
    );
    await user.click(screen.getByRole("button", { name: "Save Report" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedMv));
    expect(validateMvDailyReport).toHaveBeenCalledWith({
      tested_and_passed: "FD01-IAD06-TX6-01A",
      partially_tested: "FD02-IAD06-TX6-01B",
      failed: "",
      retested_and_passed: "",
    });
    expect(saveMvDailyReport).toHaveBeenCalledWith(
      "7-30",
      expect.objectContaining({ partially_tested: "FD02-IAD06-TX6-01B", overwrite: false }),
    );
    expect(saveDailyReport).not.toHaveBeenCalled();
  });

  it("explains that a 404 MV save requires an automation service restart", async () => {
    const user = userEvent.setup();
    vi.mocked(validateMvDailyReport).mockResolvedValue(mvValidation);
    vi.mocked(saveMvDailyReport).mockRejectedValue(
      new (await import("../../utils/automationApi")).AutomationApiError("Not Found", 404),
    );

    render(
      <DailyReportDialog
        existingReportNames={[]}
        initialReport={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        reportKind="mv"
        serviceBusy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Report" }));

    expect(
      await screen.findByText(
        "The MV report API is unavailable. Restart the local task service, then save again.",
      ),
    ).toBeInTheDocument();
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
