import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/** Coalesce pointer/wheel updates; explicit commands cancel pending motion. */
export function useFrameState<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const current = useRef(value);
  const pending = useRef<{ value: T } | null>(null);
  const frame = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const setImmediate = useCallback((update: SetStateAction<T>) => {
    cancel(); pending.current = null;
    const next = typeof update === "function" ? (update as (previous: T) => T)(current.current) : update;
    current.current = next;
    setValue(next);
  }, [cancel]);

  const flush = useCallback(() => {
    cancel();
    if (pending.current) {
      const next = pending.current.value;
      pending.current = null; current.current = next;
      setValue(next);
    }
  }, [cancel]);

  const queue = useCallback((update: SetStateAction<T>) => {
    const previous = pending.current ? pending.current.value : current.current;
    pending.current = { value: typeof update === "function" ? (update as (previous: T) => T)(previous) : update };
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => cancel, [cancel]);
  return [value, setImmediate, queue, flush] as const;
}
