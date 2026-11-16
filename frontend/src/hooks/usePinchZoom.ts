import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { PowerPlanRect } from "../types/data";
import { layoutCanvasPoint } from "../utils/layoutPlanUtils";

interface Point { x: number; y: number }
interface PinchOptions {
  sceneKey: unknown;
  getBounds: () => DOMRect | undefined;
  begin: () => PowerPlanRect;
  zoom: (view: PowerPlanRect, factor: number) => PowerPlanRect;
  change: (view: PowerPlanRect) => void;
  finish: () => void;
}

/** Track touch pointers separately from single-pointer dragging; consume all trailing fingers. */
export function usePinchZoom(options: PinchOptions) {
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: PowerPlanRect; bounds: DOMRect; distance: number; anchor: Point } | null>(null);
  const active = useRef(false);
  const suppressClick = useRef(false);

  useEffect(() => {
    pointers.current.clear(); gesture.current = null; active.current = false;
    return () => { pointers.current.clear(); gesture.current = null; active.current = false; };
  }, [options.sceneKey]);

  function down(event: ReactPointerEvent<Element>): boolean {
    if (!pointers.current.size) suppressClick.current = false;
    if (event.pointerType !== "touch") return false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 2 && !active.current) {
      const bounds = options.getBounds();
      if (bounds?.width && bounds.height) {
        const [a, b] = [...pointers.current.values()];
        const view = options.begin();
        gesture.current = { view, bounds, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          anchor: layoutCanvasPoint(view, bounds, (a.x + b.x) / 2, (a.y + b.y) / 2) };
        active.current = true; suppressClick.current = true;
      }
    }
    if (active.current) event.preventDefault();
    return active.current;
  }

  function move(event: ReactPointerEvent<Element>): boolean {
    if (!pointers.current.has(event.pointerId)) return false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!active.current) return false;
    event.preventDefault();
    const start = gesture.current;
    if (start && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const next = options.zoom(start.view, start.distance / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)));
      const scale = Math.min(start.bounds.width / next.width, start.bounds.height / next.height);
      options.change({ ...next,
        x: start.anchor.x - ((a.x + b.x) / 2 - start.bounds.left - start.bounds.width / 2) / scale - next.width / 2,
        y: start.anchor.y - ((a.y + b.y) / 2 - start.bounds.top - start.bounds.height / 2) / scale - next.height / 2 });
    }
    return true;
  }

  function end(event: ReactPointerEvent<Element>): boolean {
    if (!pointers.current.delete(event.pointerId)) return false;
    const consumed = active.current;
    // Once a pinch finger leaves, ignore remaining fingers until the gesture ends.
    if (consumed) {
      if (gesture.current) { gesture.current = null; options.finish(); }
      if (!pointers.current.size) active.current = false;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return consumed;
  }

  return { down, move, end, shouldSuppressClick: () => suppressClick.current };
}
