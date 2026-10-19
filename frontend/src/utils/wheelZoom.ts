/** SVG viewBox scale: positive wheel input zooms out, negative zooms in. */
export function wheelZoomFactor(
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
  pageHeight: number,
  scalePer100Pixels = 1.16,
): number {
  // Wheel lines have no defined pixel size; use a conventional 16px line.
  // Page-mode input uses the rendered canvas height, not drawing coordinates.
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
  const pixels = event.deltaY * unit;
  if (!Number.isFinite(pixels)) return 1;
  // No per-event floor: subdividing a wheel movement preserves its total zoom.
  return Math.exp(Math.log(scalePer100Pixels) * pixels / 100);
}
