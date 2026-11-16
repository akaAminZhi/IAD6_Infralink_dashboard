import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { layoutCanvasPoint, zoomLayoutViewport } from "../utils/layoutPlanUtils";
import { usePinchZoom } from "./usePinchZoom";

function setup() {
  const view = { x: 10, y: 20, width: 400, height: 200 };
  const bounds = { left: 50, top: 60, width: 600, height: 500 } as DOMRect;
  const change = vi.fn(), finish = vi.fn(), begin = vi.fn(() => view);
  const options = { sceneKey: "first", getBounds: () => bounds, begin,
    zoom: (current: typeof view, factor: number) => zoomLayoutViewport(current, view, factor), change, finish };
  const hook = renderHook((props) => usePinchZoom(props), { initialProps: options });
  const target = document.createElement("div");
  const event = (pointerId: number, x = 250, y = 310, pointerType = "touch") => ({
    pointerId, clientX: x, clientY: y, pointerType, currentTarget: target, preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<Element>);
  return { ...hook, options, view, bounds, change, finish, begin, event };
}

describe("map pinch zoom", () => {
  it("keeps the world point under the moving midpoint, including SVG letterboxing", () => {
    const { result, event, view, bounds, change } = setup();
    expect(result.current.down(event(1, 250))).toBe(false);
    expect(result.current.down(event(2, 450))).toBe(true);
    result.current.move(event(1, 200, 340));
    result.current.move(event(2, 600, 340));
    const next = change.mock.lastCall![0];
    expect(next.width).toBeCloseTo(view.width / 2);
    const before = layoutCanvasPoint(view, bounds, 350, 310);
    const after = layoutCanvasPoint(next, bounds, 400, 340);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    result.current.move(event(2, 300, 340));
    expect(change.mock.lastCall![0].width).toBeCloseTo(view.width * 2);
  });

  it("consumes trailing fingers and suppresses clicks until a new interaction", () => {
    const { result, event, finish, change } = setup();
    result.current.down(event(1)); result.current.down(event(2, 450));
    expect(result.current.end(event(1))).toBe(true);
    expect(result.current.move(event(2, 500))).toBe(true);
    expect(change).not.toHaveBeenCalled();
    expect(result.current.end(event(2))).toBe(true);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(result.current.shouldSuppressClick()).toBe(true);
    expect(result.current.down(event(3))).toBe(false);
    expect(result.current.shouldSuppressClick()).toBe(false);
  });

  it("leaves mouse and single-touch pan handling to the page", () => {
    const { result, event, begin, finish } = setup();
    expect(result.current.down(event(1, 250, 310, "mouse"))).toBe(false);
    expect(result.current.down(event(2))).toBe(false);
    expect(result.current.move(event(2, 300))).toBe(false);
    expect(result.current.end(event(2))).toBe(false);
    expect(begin).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
  });

  it("clears stale touches when the floor, view or map size changes", () => {
    const { result, rerender, options, event } = setup();
    result.current.down(event(1)); result.current.down(event(2, 450));
    act(() => rerender({ ...options, sceneKey: "second" }));
    expect(result.current.move(event(2))).toBe(false);
    expect(result.current.down(event(3))).toBe(false);
  });

  it("keeps limits and finite coordinates when fingers coincide or a third finger joins", () => {
    const { result, event, change, view } = setup();
    result.current.down(event(1)); result.current.down(event(2)); result.current.down(event(3));
    result.current.move(event(2));
    expect(Object.values(change.mock.lastCall![0]).every(Number.isFinite)).toBe(true);
    result.current.move(event(2, 100000));
    expect(change.mock.lastCall![0].width).toBeCloseTo(view.width * 0.02);
    result.current.end(event(3)); result.current.end(event(2)); result.current.end(event(1));
    expect(result.current.down(event(4))).toBe(false);
  });
});
