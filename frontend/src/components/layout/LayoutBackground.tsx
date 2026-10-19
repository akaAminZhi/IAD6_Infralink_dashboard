import { memo } from "react";
import type { LayoutRegionRecord } from "../../types/data";
import { projectLayoutPoint, projectedLayoutRoomLabel, projectedRectPoints, svgPoints } from "../../utils/layoutIsometricUtils";
import { layoutRoomLabels } from "../../utils/layoutPlanUtils";

export const LayoutBackground = memo(function LayoutBackground({ regions, roomLabels, isometric }: {
  regions: LayoutRegionRecord[];
  roomLabels: ReturnType<typeof layoutRoomLabels>;
  isometric: boolean;
}) {
  return <>
    <g pointerEvents="none" data-layout-layer="regions">
      {regions.map((region) => {
        const center = { x: region.rect.x + region.rect.width / 2, y: region.rect.y + region.rect.height / 2 };
        const anchor = isometric ? projectLayoutPoint(center.x, center.y) : center;
        return <g key={region.annotation_id} data-layout-region={region.kind} data-fixed={region.fixed}>
          <title>{region.label}</title>
          {isometric ? <polygon points={svgPoints(projectedRectPoints(region.rect))}
            fill={region.kind === "pod" ? "#eff6ff" : "#f1f5f9"} stroke={region.kind === "pod" ? "#93c5fd" : "#cbd5e1"}
            strokeWidth={0.6} strokeDasharray={region.kind === "pod" ? "2 1.5" : undefined} />
            : <rect {...region.rect} rx={region.kind === "pod" ? 1.5 : 2}
              fill={region.kind === "pod" ? "#eff6ff" : "#f8fafc"} stroke={region.kind === "pod" ? "#60a5fa" : "#94a3b8"}
              strokeWidth={0.45} strokeDasharray={region.kind === "pod" ? "2 1.5" : undefined} />}
          {region.kind === "pod" ? <text x={anchor.x} y={anchor.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.min(5, region.rect.width / 3)} fill="#2563eb">{region.label}</text> : null}
        </g>;
      })}
    </g>
    <g pointerEvents="none" data-layout-layer="room-labels">
      {roomLabels.map((label) => {
        const { region } = label;
        const projected = isometric ? projectedLayoutRoomLabel(region) : null;
        const { rect, fontSize } = projected ?? label;
        const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        return <g key={region.annotation_id} data-room-label={region.label} data-room-label-position={isometric ? "outside" : "inside"}>
          {projected ? <line x1={projected.anchor.x} y1={projected.anchor.y} x2={center.x} y2={center.y}
            stroke="#94a3b8" strokeWidth={0.5} /> : null}
          <rect {...rect} fill="white" rx={1.5} stroke={isometric ? "#94a3b8" : undefined} strokeWidth={isometric ? 0.4 : undefined} />
          <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}
            fontWeight={600} fill="#334155">{region.label}</text>
        </g>;
      })}
    </g>
  </>;
});
