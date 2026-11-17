import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Float beside the cable list without changing its height or scroll position. */
export function CableInspector({ anchor, children, onClose }: {
  anchor: HTMLElement | null; children: ReactNode; onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    function place() {
      if (!anchor) return;
      const bounds = anchor.getBoundingClientRect();
      const margin = 16, gap = 12;
      const width = Math.min(384, window.innerWidth - margin * 2);
      const left = bounds.left >= width + margin + gap ? bounds.left - width - gap
        : bounds.right + gap + width <= window.innerWidth - margin ? bounds.right + gap : margin;
      const top = Math.max(margin, Math.min(bounds.top, window.innerHeight - Math.min(560, window.innerHeight - margin * 2)));
      setPosition({ left, top, width, maxHeight: window.innerHeight - top - margin });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    // Browsers cannot focus the initial hidden positioning frame.
    if (position.visibility === "hidden") return;
    const previousFocus = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [position.visibility]);

  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const panel = panelRef.current;
    panel?.addEventListener("keydown", handleKey);
    return () => panel?.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(<div ref={panelRef} role="region" aria-label="Cable inspector" tabIndex={-1}
    className="fixed z-50 overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-card p-4 shadow-xl outline-none"
    style={position} onClick={(event) => event.stopPropagation()}>
    {children}
  </div>, document.body);
}
