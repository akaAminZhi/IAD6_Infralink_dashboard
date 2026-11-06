import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardResourcesProvider } from "../../contexts/DashboardResourcesContext";
import { NetaReportManifestProvider } from "../../contexts/NetaReportManifestContext";
import { duplicateManifest, makeDuplicate } from "../../test/netaDuplicateFixtures";
import * as api from "../../utils/automationApi";
import { NetaDuplicatePanel } from "./NetaDuplicatePanel";
import { NetaReportChips } from "./NetaReportChips";

const auth = vi.hoisted(() => ({ identity: null as string | null }));
vi.mock("../dataOperations/OperationsAuth", () => ({ useOperationsIdentity: () => auth.identity }));

function view(match = makeDuplicate(), refresh = vi.fn().mockResolvedValue(undefined)) {
  const manifest = duplicateManifest([match]);
  return render(<DashboardResourcesProvider value={{ resourceStatus: { netaReportManifest: "loaded" }, loadResources: refresh }}>
    <NetaReportManifestProvider manifest={manifest}><NetaDuplicatePanel equipmentId="EQ-1" /></NetaReportManifestProvider>
  </DashboardResourcesProvider>);
}

describe("NetaDuplicatePanel", () => {
  beforeEach(() => { auth.identity = null; });
  afterEach(() => vi.restoreAllMocks());
  it("shows both copies, manual confirmation and previews without write access", async () => {
    const user = userEvent.setup();
    view();
    expect(screen.getByText(/Confirmed Duplicate/)).toBeInTheDocument();
    expect(screen.getByText(/Manually confirmed by operator/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Confirmation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview Original: Original-2.pdf" }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/original/Original-2.pdf");
    await user.click(screen.getByRole("button", { name: "Close NETA report preview" }));
    await user.click(screen.getByRole("button", { name: "Preview GC: GC-1.pdf" }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/gc/GC-1.pdf");
  });
  it.each(["confirm", "revoke"] as const)("requires review then submits %s and refreshes only report resources", async (action) => {
    const user = userEvent.setup();
    auth.identity = "operator";
    vi.spyOn(api, "getAutomationAccess").mockResolvedValue({ user_id: "operator" });
    const submit = vi.spyOn(api, "decideNetaDuplicate").mockResolvedValue({ run_id: "run" } as Awaited<ReturnType<typeof api.decideNetaDuplicate>>);
    vi.spyOn(api, "getAutomationRun").mockResolvedValue({ status: "succeeded" } as Awaited<ReturnType<typeof api.getAutomationRun>>);
    const refresh = vi.fn().mockResolvedValue(undefined);
    view(makeDuplicate(action === "confirm" ? { status: "possible", can_confirm: true, can_revoke: false, confirmation_source: null } : {}), refresh);
    await user.click(await screen.findByRole("button", { name: action === "confirm" ? "Confirm Duplicate" : "Revoke Confirmation" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("GC-1.pdf");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("does not start an upload");
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(["netaReportManifest"], true));
    expect(submit).toHaveBeenCalledWith("a".repeat(64), "b".repeat(64), action);
  });
  it("withholds operations for failed access and invalid or automatic evidence", async () => {
    auth.identity = "operator";
    vi.spyOn(api, "getAutomationAccess").mockRejectedValue(new Error("Forbidden"));
    const result = view();
    await screen.findByRole("button", { name: "Check operator access" });
    expect(screen.queryByRole("button", { name: "Revoke Confirmation" })).not.toBeInTheDocument();
    result.unmount();
    vi.mocked(api.getAutomationAccess).mockResolvedValue({ user_id: "operator" });
    const automatic = view(makeDuplicate({ confirmation_source: "automatic", can_revoke: false }));
    await screen.findByRole("button", { name: "Refresh duplicate evidence" });
    expect(screen.queryByRole("button", { name: "Revoke Confirmation" })).not.toBeInTheDocument();
    automatic.unmount();
    view(makeDuplicate({ status: "invalid", can_revoke: false, problems: ["PDF contents changed"] }));
    expect(screen.getByText("PDF contents changed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Confirmation" })).not.toBeInTheDocument();
  });
  it("shows confirmation badges in either filename mode", () => {
    const manifest = duplicateManifest();
    const content = (mode: "original" | "gc") => <NetaReportManifestProvider manifest={manifest}>
      <NetaReportChips equipmentId="EQ-1" reports={["Original-2.pdf"]} compactNameMode={mode} />
    </NetaReportManifestProvider>;
    const result = render(content("original"));
    expect(screen.getByLabelText("Confirmed duplicate report")).toHaveTextContent("Duplicate");
    expect(screen.getByRole("button", { name: "Original-2.pdf" })).toBeInTheDocument();
    result.rerender(content("gc"));
    expect(screen.getByLabelText("Confirmed duplicate report")).toHaveTextContent("Duplicate");
    expect(screen.getByRole("button", { name: "GC-2.pdf" })).toBeInTheDocument();
  });
  it("shows unavailable evidence distinctly", () => {
    render(<NetaReportManifestProvider manifest={{ duplicate_audit: { available: false, errors: ["Audit missing"], matches: [] } }}>
      <NetaDuplicatePanel equipmentId="EQ-1" />
    </NetaReportManifestProvider>);
    expect(screen.getByText("Duplicate check unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/No duplicate groups/)).not.toBeInTheDocument();
  });
  it("recovers failed publication by refreshing evidence without repeating the saved decision", async () => {
    const user = userEvent.setup();
    auth.identity = "operator";
    vi.spyOn(api, "getAutomationAccess").mockResolvedValue({ user_id: "operator" });
    const decide = vi.spyOn(api, "decideNetaDuplicate").mockResolvedValue({ run_id: "decision" } as Awaited<ReturnType<typeof api.decideNetaDuplicate>>);
    vi.spyOn(api, "getAutomationRun")
      .mockResolvedValueOnce({ status: "failed" } as Awaited<ReturnType<typeof api.getAutomationRun>>)
      .mockResolvedValue({ status: "succeeded" } as Awaited<ReturnType<typeof api.getAutomationRun>>);
    vi.spyOn(api, "getRunLogs").mockResolvedValue({ content: "Duplicate decision saved. Dashboard publication failed.", offset: 0, has_more: false });
    const retry = vi.spyOn(api, "runAutomationJob").mockResolvedValue({ run_id: "refresh" } as Awaited<ReturnType<typeof api.runAutomationJob>>);
    const refresh = vi.fn().mockResolvedValue(undefined);
    view(makeDuplicate(), refresh);
    await user.click(await screen.findByRole("button", { name: "Revoke Confirmation" }));
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Decision saved, but publication failed");
    await user.click(screen.getByRole("button", { name: "Refresh duplicate evidence" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(["netaReportManifest"], true));
    expect(decide).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith("refresh_neta_duplicate_evidence");
  });
});
