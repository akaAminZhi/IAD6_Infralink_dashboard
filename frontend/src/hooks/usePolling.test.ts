import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "./usePolling";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePolling", () => {
  it("does not run on mount and runs once per interval", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));
    expect(task).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("never polls when the interval is null", async () => {
    const task = vi.fn();
    renderHook(() => usePolling(task, null));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(task).not.toHaveBeenCalled();
  });

  it("waits for a slow task to finish before scheduling the next run", async () => {
    let release: () => void = () => undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    renderHook(() => usePolling(task, 1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after the task throws", async () => {
    const task = vi.fn().mockRejectedValue(new Error("boom"));
    renderHook(() => usePolling(task, 1000));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("pauses while hidden and refreshes immediately when visible again", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(task).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    await act(async () => { await Promise.resolve(); });
    expect(task).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("does not start polling when mounted in a hidden tab until it is shown", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    setHidden(true);
    renderHook(() => usePolling(task, 1000));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(task).not.toHaveBeenCalled();
    act(() => setHidden(false));
    await act(async () => { await Promise.resolve(); });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("switches to the new interval when it changes", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ ms }) => usePolling(task, ms), { initialProps: { ms: 10_000 as number | null } });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(task).not.toHaveBeenCalled();
    rerender({ ms: 1000 });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(task).toHaveBeenCalledTimes(1);
    rerender({ ms: null });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("calls the latest task without restarting the timer", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => usePolling(fn, 1000), { initialProps: { fn: first } });
    rerender({ fn: second });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops after unmount", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => usePolling(task, 1000));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    act(() => setHidden(false));
    expect(task).not.toHaveBeenCalled();
  });
});
