import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe() {}

  unobserve() {}

  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => true;
}
