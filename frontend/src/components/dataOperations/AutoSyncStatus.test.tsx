import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AutoSyncStatus } from "../../types/automation";
import { AutoSyncBadge, AutoSyncPanel, validateIntervals } from "./AutoSyncStatus";

const base: AutoSyncStatus = {
  state: "off",
  armed: false,
  interval_seconds: 600,
  full_interval_seconds: 3600,
};

describe("AutoSyncPanel", () => {
  it("shows off when the service has no auto-sync status", () => {
    render(<AutoSyncPanel status={undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Auto-sync off");
    expect(screen.getByRole("status")).toHaveTextContent("Starts after a successful manual Daily Data Refresh");
  });

  it("shows the running mode, step, and a log link", () => {
    const onShowRun = vi.fn();
    render(
      <AutoSyncPanel
        onShowRun={onShowRun}
        status={{
          ...base,
          state: "running",
          armed: true,
          active_run_id: "auto-1",
          active_mode: "full",
          current_step: "Download NETA Reports",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Auto-sync running");
    expect(screen.getByRole("status")).toHaveTextContent("Running full sync · Download NETA Reports");
    fireEvent.click(screen.getByRole("button", { name: "View log" }));
    expect(onShowRun).toHaveBeenCalledWith("auto-1");
  });

  it("shows the next sync when armed and idle", () => {
    render(
      <AutoSyncPanel
        status={{
          ...base,
          state: "on",
          armed: true,
          next_run_at: "2026-11-19T18:10:00+00:00",
          next_full_at: "2026-11-19T19:00:00+00:00",
          last_success_at: "2026-11-19T18:00:00+00:00",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Auto-sync on");
    expect(screen.getByRole("status")).toHaveTextContent("Next light sync");
    expect(screen.getByRole("status")).toHaveTextContent("Light every 10 min · full every 60 min");
  });

  it("shows waiting while another task is active", () => {
    render(<AutoSyncPanel status={{ ...base, state: "waiting_for_idle", armed: true, waiting_for_idle: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent("it will run after the current task finishes");
  });

  it("shows the stop reason and how to resume", () => {
    render(
      <AutoSyncPanel
        status={{
          ...base,
          state: "stopped",
          stopped_reason: "Refresh JC2 Excel Exports requires a refreshed browser login.",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Stopped: Refresh JC2 Excel Exports requires a refreshed browser login. Run Daily Data Refresh to resume.",
    );
  });
});

describe("AutoSyncBadge", () => {
  it("labels the current state", () => {
    render(<AutoSyncBadge status={{ ...base, state: "running", armed: true }} />);
    expect(screen.getByTestId("auto-sync-badge")).toHaveTextContent("Auto-sync running");
  });
});

describe("AutoSyncPanel interval editor", () => {
  const editable: AutoSyncStatus = { ...base, interval_minutes: 10, full_interval_minutes: 60 };

  it("saves edited intervals", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AutoSyncPanel onSaveIntervals={onSave} status={editable} />);
    const light = screen.getByLabelText("Light sync interval (minutes)");
    const full = screen.getByLabelText("Full sync interval (minutes)");
    expect(light).toHaveValue(10);
    expect(full).toHaveValue(60);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.change(light, { target: { value: "5" } });
    fireEvent.change(full, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(5, 30));
  });

  it("blocks invalid intervals and can reset", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AutoSyncPanel onSaveIntervals={onSave} status={editable} />);
    const light = screen.getByLabelText("Light sync interval (minutes)");
    fireEvent.change(light, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Full interval must be between");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(light).toHaveValue(10);
  });

  it("shows a save error from the service", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Auto-sync belongs to another operator."));
    render(<AutoSyncPanel onSaveIntervals={onSave} status={editable} />);
    fireEvent.change(screen.getByLabelText("Light sync interval (minutes)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("another operator");
  });

  it("validates whole minutes within range", () => {
    expect(validateIntervals("10", "60")).toBeNull();
    expect(validateIntervals("0", "60")).toMatch(/Light interval/);
    expect(validateIntervals("2.5", "60")).toBe("Enter whole minutes.");
    expect(validateIntervals("10", "1441")).toMatch(/Full interval/);
  });
});

describe("AutoSyncPanel for another operator's auto-sync", () => {
  it("shows the state read-only without a log link", () => {
    const onSave = vi.fn();
    render(
      <AutoSyncPanel
        onSaveIntervals={onSave}
        onShowRun={vi.fn()}
        status={{ ...base, state: "running", armed: true, owned_by_other: true, active_mode: "light", interval_minutes: 10, full_interval_minutes: 60 }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Auto-sync running (another operator)");
    expect(screen.getByRole("status")).toHaveTextContent("takes it over with your session");
    expect(screen.getByRole("status")).toHaveTextContent("Light every 10 min · full every 60 min");
    expect(screen.queryByLabelText("Light sync interval (minutes)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View log" })).not.toBeInTheDocument();
  });

  it("hides the other operator's stop reason", () => {
    render(<AutoSyncPanel status={{ ...base, state: "stopped", owned_by_other: true, stopped_reason: "secret" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Another operator's auto-sync stopped");
    expect(screen.getByRole("status")).not.toHaveTextContent("secret");
  });

  it("labels the badge", () => {
    render(<AutoSyncBadge status={{ ...base, state: "on", armed: true, owned_by_other: true }} />);
    expect(screen.getByTestId("auto-sync-badge")).toHaveTextContent("Auto-sync on (another operator)");
  });
});
