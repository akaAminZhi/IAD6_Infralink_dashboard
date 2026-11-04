import { memo } from "react";
import type { PowerPlanPoint, PowerPlanRect } from "../../types/data";
import { projectLayoutPoint, projectedRectPoints, svgPoints } from "../../utils/layoutIsometricUtils";

/** A light, shallow deck under each entire floor; equipment stays above both decks. */
export const LayoutFloorGround = memo(function LayoutFloorGround({ floorId, rect, raised = false }: {
  floorId: string;
  rect: PowerPlanRect;
  raised?: boolean;
}) {
  const top = projectedRectPoints(rect), bottom = projectedRectPoints(rect, -3);
  const grid: PowerPlanPoint[][] = [];
  for (let x = Math.ceil(rect.x / 100) * 100; x < rect.x + rect.width; x += 100) {
    grid.push([projectLayoutPoint(x, rect.y), projectLayoutPoint(x, rect.y + rect.height)]);
  }
  for (let y = Math.ceil(rect.y / 100) * 100; y < rect.y + rect.height; y += 100) {
    grid.push([projectLayoutPoint(rect.x, y), projectLayoutPoint(rect.x + rect.width, y)]);
  }
  return <g data-layout-ground={floorId} pointerEvents="none" aria-hidden="true">
    <polygon points={svgPoints([top[1], top[2], bottom[2], bottom[1]])} fill="#c8d4de" fillOpacity={0.65}
      stroke="#aebfcb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" data-ground-face="side" />
    <polygon points={svgPoints([top[2], top[3], bottom[3], bottom[2]])} fill="#d4dfe7" fillOpacity={0.65}
      stroke="#aebfcb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" data-ground-face="front" />
    <polygon points={svgPoints(top)} fill={raised ? "#e4edf4" : "#eef2f5"} fillOpacity={raised ? 0.6 : 0.8}
      stroke="#a8bccb" strokeWidth={0.8} vectorEffect="non-scaling-stroke" data-ground-face="top" />
    <g stroke="#b9cbd8" opacity={0.22}>
      {grid.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
    </g>
  </g>;
});
