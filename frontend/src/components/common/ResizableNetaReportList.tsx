import { GripHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../utils/cn";

const initialHeight = 192;
const keyboardStep = 24;

export function ResizableNetaReportList({
  as: Content = "div",
  children,
  className,
  contentClassName,
}: {
  as?: "div" | "ul";
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const listId = useId();
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const [height, setHeight] = useState(initialHeight);
  const [maxHeight, setMaxHeight] = useState(initialHeight);
  const visibleHeight = Math.min(height, maxHeight);

  useEffect(() => {
    const element = content.current;
    if (!element) return;

    const measure = () => setMaxHeight(Math.max(initialHeight, element.scrollHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function resize(nextHeight: number) {
    setHeight(Math.max(initialHeight, Math.min(maxHeight, Math.round(nextHeight))));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowUp":
        resize(visibleHeight - keyboardStep);
        break;
      case "ArrowDown":
        resize(visibleHeight + keyboardStep);
        break;
      case "Home":
        resize(initialHeight);
        break;
      case "End":
        resize(maxHeight);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <div
        aria-label="NETA report list"
        className="overflow-y-auto [scrollbar-gutter:stable]"
        id={listId}
        role="region"
        style={{ height: visibleHeight }}
        tabIndex={0}
      >
        <div ref={content}>
          <Content className={contentClassName}>{children}</Content>
        </div>
      </div>
      {maxHeight > initialHeight ? (
        <div
          aria-controls={listId}
          aria-label="Resize NETA report list"
          aria-orientation="horizontal"
          aria-valuemax={maxHeight}
          aria-valuemin={initialHeight}
          aria-valuenow={visibleHeight}
          aria-valuetext={`${visibleHeight} pixels high`}
          className="flex h-6 cursor-ns-resize touch-none select-none items-center justify-center rounded-b-md border-t bg-muted/40 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onKeyDown={handleKeyDown}
          onLostPointerCapture={() => { drag.current = null; }}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: visibleHeight };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start?.pointerId === event.pointerId) {
              resize(start.startHeight + event.clientY - start.startY);
            }
          }}
          role="separator"
          tabIndex={0}
          title="Drag to resize the report list"
        >
          <GripHorizontal aria-hidden="true" className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}
