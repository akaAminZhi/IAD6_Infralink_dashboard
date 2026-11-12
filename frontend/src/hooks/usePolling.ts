import { useEffect, useRef } from "react";

/**
 * Runs `task` repeatedly, waiting `intervalMs` after each run finishes (so slow
 * responses never overlap). Pass `null` to disable. Polling pauses while the
 * tab is hidden and runs once immediately when it becomes visible again.
 * The task is not run on mount; callers do their own initial load.
 */
export function usePolling(task: () => Promise<unknown> | unknown, intervalMs: number | null): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (intervalMs === null) {
      return;
    }
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (cancelled || document.hidden) {
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    };
    const tick = async () => {
      if (cancelled || running) {
        return;
      }
      running = true;
      try {
        await taskRef.current();
      } catch {
        // The task reports its own errors; keep polling.
      } finally {
        running = false;
      }
      schedule();
    };
    const onVisibilityChange = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
