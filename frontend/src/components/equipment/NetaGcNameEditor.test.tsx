import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetaReportFileRecord } from "../../types/data";
import * as api from "../../utils/automationApi";
import { NetaGcNameEditor, useLocalGcRenameAccess, validateGcReportName } from "./NetaGcNameEditor";

const env = vi.hoisted(() => ({ identity: null as string | null, local: false }));
vi.mock("../dataOperations/OperationsAuth", () => ({ useOperationsIdentity: () => env.identity }));
vi.mock("../../utils/localOperations", () => ({ isLocalOperationsMode: () => env.local }));

const record: NetaReportFileRecord = {
  source_key: "gc", equipment_id: "EQ-1", report_name: "EQ-1-WRONG.pdf",
  relative_path: "_temporary/EQ-1/EQ-1-WRONG.pdf", source_sha256: "a".repeat(64),
};

describe("useLocalGcRenameAccess", () => {
  beforeEach(() => { env.identity = null; env.local = false; });
  afterEach(() => vi.restoreAllMocks());

  it("grants rename only to the verified loopback local operator", async () => {
    const access = vi.spyOn(api, "getAutomationAccess").mockResolvedValue({ user_id: "local_operator" });
    env.identity = "clerk_user";
    env.local = false;
    expect(renderHook(() => useLocalGcRenameAccess()).result.current).toBe(false);
    env.identity = "local_operator";
    const notLocalHost = renderHook(() => useLocalGcRenameAccess());
    expect(notLocalHost.result.current).toBe(false);
    expect(access).not.toHaveBeenCalled();
    env.local = true;
    const local = renderHook(() => useLocalGcRenameAccess());
    await waitFor(() => expect(local.result.current).toBe(true));
  });

  it("stays read only when the local service reports a different identity", async () => {
    env.identity = "local_operator";
    env.local = true;
    vi.spyOn(api, "getAutomationAccess").mockResolvedValue({ user_id: "someone_else" });
    const hook = renderHook(() => useLocalGcRenameAccess());
    await waitFor(() => expect(api.getAutomationAccess).toHaveBeenCalled());
    expect(hook.result.current).toBe(false);
  });
});

describe("NetaGcNameEditor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hides the rename control without local access but still shows pending CxAlloy updates", () => {
    render(<NetaGcNameEditor canRename={false} onRenamed={vi.fn()} record={{
      ...record, pending_cxalloy_rename: { old_name: "OLD.pdf", new_name: "EQ-1-WRONG.pdf", last_error: "line answered" },
    }} />);
    expect(screen.queryByRole("button", { name: /Rename GC report/ })).not.toBeInTheDocument();
    expect(screen.getByText(/CxAlloy update pending/)).toBeInTheDocument();
    expect(screen.getByText("OLD.pdf → EQ-1-WRONG.pdf")).toBeInTheDocument();
    expect(screen.getByText(/line answered/)).toBeInTheDocument();
  });

  it("previews, confirms the CxAlloy replacement and refreshes after the run", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "previewNetaGcRename").mockResolvedValue({
      device: "EQ-1", old_name: "EQ-1-WRONG.pdf", new_name: "EQ-1-FB1.pdf", will_queue_cxalloy: true,
    });
    const rename = vi.spyOn(api, "renameNetaGcReport").mockResolvedValue({ run_id: "run-1" } as Awaited<ReturnType<typeof api.renameNetaGcReport>>);
    vi.spyOn(api, "getAutomationRun").mockResolvedValue({ status: "succeeded" } as Awaited<ReturnType<typeof api.getAutomationRun>>);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRenamed = vi.fn();
    render(<NetaGcNameEditor canRename onRenamed={onRenamed} record={record} />);
    await user.click(screen.getByRole("button", { name: "Rename GC report EQ-1-WRONG.pdf" }));
    const input = screen.getByRole("textbox", { name: "New GC report name" });
    expect(input).toHaveValue("EQ-1-WRONG");
    await user.clear(input);
    await user.type(input, "EQ-1-FB1.pdf");
    await user.click(screen.getByRole("button", { name: "Save GC report name" }));
    await waitFor(() => expect(onRenamed).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0]).toMatch(/delete the old attachment and upload the renamed PDF/);
    expect(rename).toHaveBeenCalledWith("_temporary/EQ-1/EQ-1-WRONG.pdf", "EQ-1-FB1", "a".repeat(64));
    expect(await screen.findByRole("status")).toHaveTextContent("GC report renamed");
  });

  it("does not rename when the operator cancels or the name is invalid", async () => {
    const user = userEvent.setup();
    const preview = vi.spyOn(api, "previewNetaGcRename").mockResolvedValue({
      device: "EQ-1", old_name: "EQ-1-WRONG.pdf", new_name: "EQ-1-X.pdf", will_queue_cxalloy: false,
    });
    const rename = vi.spyOn(api, "renameNetaGcReport");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NetaGcNameEditor canRename onRenamed={vi.fn()} record={record} />);
    await user.click(screen.getByRole("button", { name: /Rename GC report/ }));
    const input = screen.getByRole("textbox", { name: "New GC report name" });
    await user.clear(input);
    await user.type(input, "bad/name");
    await user.click(screen.getByRole("button", { name: "Save GC report name" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Remove");
    expect(preview).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "EQ-1-X");
    await user.click(screen.getByRole("button", { name: "Save GC report name" }));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    expect(rename).not.toHaveBeenCalled();
  });

  it("offers the PDF-derived name as a pre-filled rename without submitting it", async () => {
    const user = userEvent.setup();
    const preview = vi.spyOn(api, "previewNetaGcRename");
    render(<NetaGcNameEditor canRename onRenamed={vi.fn()} record={record} suggestedName="EQ-1-RIGHT.pdf" />);
    expect(screen.getByText("EQ-1-RIGHT.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use suggested GC name for EQ-1-WRONG.pdf" }));
    expect(screen.getByRole("textbox", { name: "New GC report name" })).toHaveValue("EQ-1-RIGHT");
    expect(preview).not.toHaveBeenCalled();
  });

  it("hides a suggestion that equals the current name", () => {
    render(<NetaGcNameEditor canRename onRenamed={vi.fn()} record={record} suggestedName="EQ-1-WRONG.pdf" />);
    expect(screen.queryByText(/PDF header suggests/)).not.toBeInTheDocument();
  });

  it("requires a Tracker hash before offering rename", () => {
    render(<NetaGcNameEditor canRename onRenamed={vi.fn()} record={{ ...record, source_sha256: null }} />);
    expect(screen.queryByRole("button", { name: /Rename GC report/ })).not.toBeInTheDocument();
  });
});

describe("validateGcReportName", () => {
  it.each([
    ["", "Enter a report name."],
    ["a:b", 'Remove \\ / : * ? " < > | characters.'],
    ["x".repeat(151), "Use 150 characters or fewer."],
    ["EQ-1-FB1.pdf", null],
  ])("validates %j", (value, expected) => {
    expect(validateGcReportName(value)).toBe(expected);
  });
});
