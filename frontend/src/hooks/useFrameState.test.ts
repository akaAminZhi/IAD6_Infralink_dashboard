import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrameState } from "./useFrameState";

let callbacks: Map<number, FrameRequestCallback>;
beforeEach(() => {
  callbacks = new Map();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++; callbacks.set(id, callback); return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { callbacks.delete(id); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("frame-coalesced camera state", () => {
  it("composes a burst of wheel updates and commits only once per frame", () => {
    const { result } = renderHook(() => useFrameState(0));
    act(() => { result.current[2]((v) => v + 1); result.current[2]((v) => v + 1); result.current[2]((v) => v + 1); });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(0);
    act(() => [...callbacks.values()][0](0));
    expect(result.current[0]).toBe(3);
  });

  it("cancels pending movement when Global view or a search sets the camera directly", () => {
    const { result } = renderHook(() => useFrameState<number | null>(null));
    act(() => result.current[2](17));
    const pendingCallback = [...callbacks.values()][0];
    act(() => result.current[1](null));
    act(() => pendingCallback(0));
    expect(result.current[0]).toBeNull();
    expect(callbacks.size).toBe(0);
  });

  it("flushes the final drag position on pointer release", () => {
    const { result } = renderHook(() => useFrameState(0));
    act(() => { result.current[2](3); result.current[2](11); result.current[3](); });
    expect(result.current[0]).toBe(11);
    expect(callbacks.size).toBe(0);
  });

  it("cancels scheduled work on unmount", () => {
    const { result, unmount } = renderHook(() => useFrameState(0));
    act(() => result.current[2](5));
    unmount();
    expect(callbacks.size).toBe(0);
  });
});
