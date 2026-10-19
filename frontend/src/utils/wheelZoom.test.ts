import { describe, expect, it } from "vitest";
import { wheelZoomFactor } from "./wheelZoom";

describe("wheel zoom normalization", () => {
  it.each([1.16, 1.18])("preserves cumulative zoom across 34 small events (sensitivity %s)", (sensitivity) => {
    for (const direction of [-1, 1]) {
      const single = wheelZoomFactor({ deltaY: direction * 100, deltaMode: 0 }, 600, sensitivity);
      // A small leading event followed by the remainder of the captured movement.
      const deltas = [0.83, ...Array<number>(33).fill(99.17 / 33)];
      const split = deltas.reduce((scale, deltaY) => scale * wheelZoomFactor({
        deltaY: direction * deltaY, deltaMode: 0,
      }, 600, sensitivity), 1);
      expect(split).toBeCloseTo(single, 12);
    }
  });

  it("converts lines and pages to equivalent pixel input", () => {
    const pixels = wheelZoomFactor({ deltaY: -100, deltaMode: 0 }, 800);
    expect(wheelZoomFactor({ deltaY: -6.25, deltaMode: 1 }, 800)).toBeCloseTo(pixels, 12);
    expect(wheelZoomFactor({ deltaY: -0.125, deltaMode: 2 }, 800)).toBeCloseTo(pixels, 12);
  });

  it("keeps the standard notch close to the old sensitivity and reverses cleanly", () => {
    const out = wheelZoomFactor({ deltaY: 100, deltaMode: 0 }, 600);
    const into = wheelZoomFactor({ deltaY: -100, deltaMode: 0 }, 600);
    expect(out).toBeCloseTo(1.16, 12);
    expect(into).toBeCloseTo(0.86, 2);
    expect(out * into).toBeCloseTo(1, 12);
    expect(wheelZoomFactor({ deltaY: -0.001, deltaMode: 0 }, 600)).toBeGreaterThan(0.999);
    expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 }, 600)).toBe(1);
  });
});
