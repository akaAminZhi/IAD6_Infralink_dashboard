import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NetaReportManifestProvider } from "../../contexts/NetaReportManifestContext";
import type { NetaReportManifest } from "../../types/data";
import { NetaReportChips } from "./NetaReportChips";

describe("NetaReportChips lifecycle", () => {
  it.each(["compact", "stacked", "list"])("previews temporary Original/GC then refreshed formal PDFs (%s)", async (appearance) => {
    const user = userEvent.setup();
    const manifest = (stage: "temporary" | "formal"): NetaReportManifest => ({ records: [
      { equipment_id: "EQ-1", source_key: "downloaded", source_label: "Original", report_name: "Report.pdf", report_stage: stage, url: `/${stage}/original.pdf` },
      { equipment_id: "EQ-1", source_key: "gc", source_label: "GC", source_report_name: "Report.pdf", report_name: "GC.pdf", report_stage: stage, url: `/${stage}/gc.pdf` },
      { equipment_id: "EQ-2", source_key: "gc", source_report_name: "Report.pdf", report_name: "Wrong.pdf", url: "/wrong.pdf" },
    ] });
    const view = (stage: "temporary" | "formal", mode: "original" | "gc") => (
      <NetaReportManifestProvider manifest={manifest(stage)}>
        <NetaReportChips reports={["Report.pdf"]} equipmentId="EQ-1" compactNameMode={mode}
          showLinkedFileNames={appearance !== "compact"} listAppearance={appearance === "list"} />
      </NetaReportManifestProvider>
    );
    const { rerender } = render(view("temporary", "original"));
    expect(screen.getByText("Temporary")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report.pdf" }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/temporary/original.pdf");
    await user.click(screen.getByRole("button", { name: "Close NETA report preview" }));
    rerender(view("temporary", "gc"));
    await user.click(screen.getByRole("button", { name: "GC.pdf" }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/temporary/gc.pdf");
    await user.click(screen.getByRole("button", { name: "Close NETA report preview" }));
    rerender(view("formal", "gc"));
    expect(screen.queryByText("Temporary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "GC.pdf" }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/formal/gc.pdf");
  });
});
