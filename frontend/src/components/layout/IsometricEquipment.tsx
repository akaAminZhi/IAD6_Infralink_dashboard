import { memo, type ReactNode } from "react";
import type { LayoutEquipmentRecord } from "../../types/data";
import { insetEquipmentRect, type LayoutStatus } from "../../utils/layoutPlanUtils";
import { layoutDeviceHeight, layoutDeviceKind, projectLayoutPoint, projectedLayoutBounds, projectedRectPoints, svgPoints,
  type LayoutDeviceKind } from "../../utils/layoutIsometricUtils";

interface EnclosurePalette { top: string; left: string; right: string }
const ENCLOSURE: EnclosurePalette = { top: "#e1ebef", left: "#acbec8", right: "#8098a6" };
const STATUS_PALETTES: Record<LayoutStatus, EnclosurePalette> = {
  notEnergized: ENCLOSURE,
  unknown: ENCLOSURE,
  energizeToday: { top: "#ffd09a", left: "#edb675", right: "#cf9153" },
  energized: { top: "#f9a8a2", left: "#e68c87", right: "#c76964" },
};
const BASE: EnclosurePalette = { top: "#beced5", left: "#8fa5b1", right: "#718a99" };
const DARK: EnclosurePalette = { top: "#9bb0bd", left: "#7c95a4", right: "#5f7888" };
const UPS_ENCLOSURE: EnclosurePalette = { top: "#4b5563", left: "#374151", right: "#252d38" };
const UPS_BASE: EnclosurePalette = { top: "#374151", left: "#273240", right: "#19212b" };
function equipmentPalette(kind: LayoutDeviceKind, status: LayoutStatus): EnclosurePalette {
  return kind === "ups" && (status === "notEnergized" || status === "unknown") ? UPS_ENCLOSURE : STATUS_PALETTES[status];
}
const SIMPLE_KINDS: LayoutDeviceKind[] = ["mvTransformer", "utility", "generator", "lvTransformer", "ups", "cabinet"];
const SIMPLE_STATUSES: LayoutStatus[] = ["notEnergized", "energizeToday", "energized", "unknown"];

/** Shared silhouettes keep dense floors to one SVG shape per unselected device. */
export function SimpleIsometricSymbols() {
  return <defs>{SIMPLE_STATUSES.flatMap((status) => SIMPLE_KINDS.map((kind) => {
    const colors = equipmentPalette(kind, status);
    return <symbol key={`${kind}-${status}`} id={`layout-simple-${kind}-${status}`} viewBox="0 0 100 100">
      <path d="M 12 76 L 55 96 L 99 74 L 56 53 Z" fill="#526a78" opacity="0.12" />
      <polygon points="7,37 52,57 52,91 7,70" fill={colors.left} stroke="#8197a4" strokeWidth="0.8" />
      <polygon points="52,57 93,36 93,69 52,91" fill={colors.right} stroke="#8197a4" strokeWidth="0.8" />
      <polygon points="7,37 48,17 93,36 52,57" fill={colors.top} stroke="#8197a4" strokeWidth="0.8" />
      {kind === "mvTransformer" ? <>
        <path d="M 27 28 V 5 M 48 37 V 11 M 69 30 V 7" stroke="#81522f" strokeWidth="3" />
        <path d="M 12 43 L 48 60 M 12 53 L 48 70" stroke="#718a99" strokeWidth="1.4" />
      </> : kind === "utility" ? <path d="M 21 46 V 68 M 36 53 V 75 M 66 51 V 76" stroke="#718a99" strokeWidth="1.6" />
        : kind === "generator" ? <>
          <path d="M 70 25 V 3" stroke="#5f7888" strokeWidth="3" />
          <circle cx="43" cy="37" r="5" fill="#8fa5b1" />
        </> : kind === "ups" ? <>
          <path d="M 55 59 L 90 41 V 68 L 55 86 Z" fill="#31434e" />
          <path d="M 66 54 V 80 M 78 48 V 74 M 58 72 L 87 57 M 58 77 L 87 62" stroke="#8fa5b1" strokeWidth="1" />
          <path d="M 58 60 L 63 57 V 62 L 58 65 Z" fill="#8dcbd8" />
          <path d="M 13 54 L 46 69 M 13 59 L 46 74" stroke="#5f7888" strokeWidth="1.4" />
        </> : kind === "lvTransformer" ? <path d="M 13 49 L 46 65 M 13 57 L 46 73 M 13 65 L 46 81" stroke="#718a99" strokeWidth="1.4" />
          : <path d="M 15 45 L 43 58 V 79 L 15 66 Z M 39 64 V 68" fill="none" stroke="#718a99" strokeWidth="1.2" />}
    </symbol>;
  }))}</defs>;
}

/** Industrial illustrations built in the same world-space grid as their cables. */
const EquipmentModel = memo(function EquipmentModel({ record, status, detailed, showLabel, compact }: {
  record: LayoutEquipmentRecord; status: LayoutStatus; detailed: boolean; showLabel: boolean; compact: boolean;
}) {
  const rect = insetEquipmentRect(record.rect);
  const { x, y, width: w, height: d } = rect;
  const h = layoutDeviceHeight(record), kind = layoutDeviceKind(record), s = Math.min(w, d);
  const outline = kind === "ups" ? "#56616f" : "#8197a4", detail = kind === "ups" ? "#8a98a7" : "#5f7888";
  const lineWidth = Math.max(0.055, Math.min(0.2, s * 0.009));
  const palette = equipmentPalette(kind, status);
  const p = (u: number, v: number, z: number) => projectLayoutPoint(x + u * w, y + v * d, z);
  const polygon = (coords: [number, number, number][], fill: string, extra = {}) =>
    <polygon points={svgPoints(coords.map(([u, v, z]) => p(u, v, z)))} fill={fill} {...extra} />;
  const line = (a: [number, number, number], b: [number, number, number], color = detail, thickness = lineWidth) => {
    const start = p(...a), end = p(...b);
    return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={thickness} strokeLinecap="round" />;
  };
  const box = (u: number, v: number, width: number, depth: number, z: number, height: number,
    colors: EnclosurePalette = palette, part?: string) => <g data-model-part={part} stroke={outline} strokeWidth={lineWidth} strokeLinejoin="round">
    {polygon([[u + width, v + depth, z + height], [u, v + depth, z + height], [u, v + depth, z], [u + width, v + depth, z]], colors.left, { "data-enclosure-face": "left" })}
    {polygon([[u + width, v, z + height], [u + width, v + depth, z + height], [u + width, v + depth, z], [u + width, v, z]], colors.right, { "data-enclosure-face": "right" })}
    {polygon([[u, v, z + height], [u + width, v, z + height], [u + width, v + depth, z + height], [u, v + depth, z + height]], colors.top, { "data-enclosure-face": "top" })}
  </g>;
  const bushing = (u: number, v: number, z: number, height: number, radius = s * 0.045) => {
    const bottom = p(u, v, z), top = p(u, v, z + height);
    return <g data-model-part="ceramic-insulator">
      <ellipse cx={bottom.x} cy={bottom.y} rx={radius * 1.5} ry={radius * 0.7} fill="#c5d1d6" stroke={outline} strokeWidth={lineWidth} />
      <path d={`M ${bottom.x - radius * 0.55} ${bottom.y} L ${top.x - radius * 0.55} ${top.y} L ${top.x + radius * 0.55} ${top.y} L ${bottom.x + radius * 0.55} ${bottom.y} Z`} fill="#81522f" />
      {Array.from({ length: 7 }, (_, i) => <ellipse key={i} cx={bottom.x} cy={bottom.y - height * (i + 0.6) / 7.6}
        rx={radius * (1 - i * 0.035)} ry={radius * 0.42} fill={i % 2 ? "#986c43" : "#a77a4f"} stroke="#795133" strokeWidth={lineWidth * 0.65} />)}
      <path d={`M ${top.x} ${top.y} v ${-height * 0.16}`} stroke="#a7b7c0" strokeWidth={radius * 0.55} />
      <ellipse cx={top.x} cy={top.y - height * 0.16} rx={radius * 0.48} ry={radius * 0.24} fill="#e3e9ec" />
    </g>;
  };
  const vent = (u: number, v: number, z: number, width: number, height: number, face: "left" | "right" = "left") =>
    <g data-model-part="ventilation" opacity={0.8}>
      {Array.from({ length: 6 }, (_, i) => <g key={i}>{face === "left"
        ? line([u, v, z + height * i / 6], [u + width, v, z + height * i / 6])
        : line([u, v, z + height * i / 6], [u, v + width, z + height * i / 6])}</g>)}
    </g>;
  const door = (u: number, v: number, width: number, z: number, height: number) => <g data-model-part="cabinet-door">
    {polygon([[u, v, z], [u + width, v, z], [u + width, v, z + height], [u, v, z + height]], status === "energized" || status === "energizeToday" ? palette.left : "#bbccd4", { stroke: outline, strokeWidth: lineWidth })}
    {polygon([[u + width * 0.17, v, z + height * 0.68], [u + width * 0.6, v, z + height * 0.68],
      [u + width * 0.6, v, z + height * 0.84], [u + width * 0.17, v, z + height * 0.84]], "#6e8999")}
    {line([u + width * 0.83, v, z + height * 0.31], [u + width * 0.83, v, z + height * 0.48], "#e9eef0", lineWidth * 2.8)}
    {polygon([[u + width * 0.27, v, z + height * 0.48], [u + width * 0.46, v, z + height * 0.48],
      [u + width * 0.365, v, z + height * 0.6]], "#d8b960")}
  </g>;
  const fan = (u: number, v: number, z: number, radius: number) => {
    const center = p(u, v, z);
    return <g data-model-part="cooling-fan" transform={`translate(${center.x} ${center.y}) matrix(1 0.5 -1 0.5 0 0)`}>
      <circle r={radius} fill="#8099a8" stroke="#6b8493" strokeWidth={lineWidth} />
      {[0, 90, 180, 270].map((rotation) => <path key={rotation} transform={`rotate(${rotation})`}
        d={`M 0 0 Q ${radius * 0.1} ${-radius} ${radius * 0.72} ${-radius * 0.47} Q ${radius * 0.65} ${radius * 0.1} 0 0`} fill="#b8c9d2" />)}
      <circle r={radius * 0.2} fill="#d5e0e5" />
    </g>;
  };
  const base = projectedRectPoints(rect);
  const label = p(0.5, 1.05, -Math.max(1.3, s * 0.08));
  const labelText = record.label.replace(/^IAD06-/i, "");
  const labelSize = Math.min(4, Math.max(0.9, s * 0.18), (w + d) * 1.4 / (Math.max(4, labelText.length) * 0.55));
  const upsFront = (full: boolean) => <g data-model-part="ups-module-bays">
    {[0, 1, 2].map((i) => {
      const v = 0.11 + i * 0.26;
      const panel = (v0: number, v1: number, z0: number, z1: number, fill: string) =>
        polygon([[0.904, v0, z0 * h], [0.904, v1, z0 * h], [0.904, v1, z1 * h], [0.904, v0, z1 * h]], fill,
          { stroke: "#718a99", strokeWidth: lineWidth * 0.8 });
      return <g key={i} data-model-part="ups-module-door">
        {panel(v, v + 0.235, 0.13, 0.86, "#31434e")}
        {full ? <>
          {line([0.906, v + 0.025, h * 0.43], [0.906, v + 0.025, h * 0.6], "#d0dce2", lineWidth * 2)}
          {vent(0.906, v + 0.045, h * 0.2, 0.15, h * 0.18, "right")}
          {vent(0.906, v + 0.045, h * 0.65, 0.15, h * 0.12, "right")}
        </> : line([0.906, v + 0.04, h * 0.29], [0.906, v + 0.2, h * 0.29], "#8fa5b1")}
        {i === 2 ? <g data-model-part="ups-display">
          {panel(v + 0.06, v + 0.18, 0.54, 0.7, "#182a36")}
          {panel(v + 0.075, v + 0.165, 0.57, 0.67, "#8dcbd8")}
        </g> : null}
      </g>;
    })}
  </g>;
  if (compact && !detailed) {
    const extent = projectedLayoutBounds(rect, h);
    return <g data-device-model={kind} data-device-detail="compact">
      <use href={`#layout-simple-${kind}-${status}`} x={extent.x} y={extent.y} width={extent.width} height={extent.height} />
      {showLabel ? <text pointerEvents="none" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="hanging"
        fontSize={labelSize} fill="#344c5c" paintOrder="stroke" stroke="#ffffff" strokeWidth={labelSize * 0.32} strokeLinejoin="round">
        {labelText}
      </text> : null}
    </g>;
  }
  if (!detailed) {
    const simpleModel = kind === "mvTransformer" ? <>
      {box(0.1, 0.12, 0.8, 0.76, 0, h * 0.08, BASE)}
      {box(0.2, 0.18, 0.68, 0.65, h * 0.08, h * 0.66)}
      {[0.35, 0.55, 0.75].map((v) => <g key={v}>{line([0.58, v, h * 0.74], [0.58, v, h * 0.97], "#81522f", s * 0.045)}</g>)}
    </> : kind === "utility" ? <>
      {box(0.08, 0.08, 0.84, 0.84, 0, h * 0.82)}
      {[0.34, 0.61].map((u) => <g key={u}>{line([u, 0.92, h * 0.12], [u, 0.92, h * 0.75])}</g>)}
    </> : kind === "generator" ? <>
      {box(0.08, 0.08, 0.84, 0.84, 0, h * 0.72)}
      {line([0.75, 0.18, h * 0.72], [0.75, 0.18, h * 1.04], detail, s * 0.06)}
    </> : kind === "lvTransformer" ? <>
      {box(0.1, 0.1, 0.8, 0.8, 0, h * 0.84)}
      {line([0.2, 0.91, h * 0.26], [0.78, 0.91, h * 0.26])}
      {line([0.2, 0.91, h * 0.38], [0.78, 0.91, h * 0.38])}
    </> : kind === "ups" ? <>
      {box(0.1, 0.08, 0.8, 0.84, h * 0.07, h * 0.83)}
      {upsFront(false)}
      {line([0.2, 0.924, h * 0.25], [0.8, 0.924, h * 0.25])}
    </> : <>
      {box(0.12, 0.12, 0.76, 0.76, 0, h * 0.9)}
      {line([0.8, 0.88, h * 0.24], [0.8, 0.88, h * 0.45])}
    </>;
    return <g data-device-model={kind} data-device-detail="simple">
      <polygon points={svgPoints(base.map((point) => ({ x: point.x + s * 0.16, y: point.y + s * 0.1 })))} fill="#526a78" opacity={0.12} />
      {simpleModel}
      {showLabel ? <text pointerEvents="none" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="hanging"
        fontSize={labelSize} fill="#344c5c" paintOrder="stroke" stroke="#ffffff" strokeWidth={labelSize * 0.32} strokeLinejoin="round">
        {labelText}
      </text> : null}
    </g>;
  }
  let model: ReactNode;
  if (kind === "mvTransformer") {
    model = <>
      {box(0.08, 0.08, 0.84, 0.84, 0, h * 0.065, BASE, "transformer-skid")}
      {box(0.29, 0.19, 0.59, 0.66, h * 0.065, h * 0.54, palette, "oil-tank")}
      {box(0.06, 0.21, 0.22, 0.64, h * 0.1, h * 0.39, BASE, "radiator-bank")}
      {Array.from({ length: 8 }, (_, i) => <g key={i}>{box(0.055, 0.24 + i * 0.073, 0.23, 0.021, h * 0.11, h * 0.37, ENCLOSURE)}</g>)}
      {box(0.87, 0.53, 0.1, 0.29, h * 0.08, h * 0.36, ENCLOSURE, "connection-cabinet")}
      {box(0.31, 0.17, 0.59, 0.7, h * 0.605, h * 0.045, palette, "tank-lid")}
      {[0.35, 0.53, 0.71].map((v) => <g key={v}>{bushing(0.62, v, h * 0.65, h * 0.28, s * 0.041)}</g>)}
      {line([0.4, 0.28, h * 0.65], [0.4, 0.28, h * 0.83], "#94aab7", s * 0.06)}
      {line([0.35, 0.23, h * 0.84], [0.35, 0.75, h * 0.84], "#a5bac6", s * 0.17)}
      {line([0.35, 0.23, h * 0.86], [0.35, 0.75, h * 0.86], "#c9d8df", s * 0.065)}
    </>;
  } else if (kind === "utility") {
    model = <>
      {box(0.08, 0.08, 0.84, 0.83, 0, h * 0.055, DARK, "switchgear-plinth")}
      {[0, 1, 2].map((i) => <g key={i} data-model-part="switchgear-bay">
        {box(0.1 + i * 0.267, 0.11, 0.255, 0.76, h * 0.055, h * 0.72)}
        {door(0.12 + i * 0.267, 0.872, 0.212, h * 0.12, h * 0.59)}
        {bushing(0.22 + i * 0.267, 0.35, h * 0.775, h * 0.16, s * 0.026)}
      </g>)}
    </>;
  } else if (kind === "generator") {
    model = <>
      {box(0.08, 0.05, 0.84, 0.9, 0, h * 0.12, DARK, "generator-fuel-base")}
      {box(0.1, 0.07, 0.8, 0.68, h * 0.12, h * 0.58, palette, "generator-acoustic-enclosure")}
      {box(0.1, 0.75, 0.8, 0.18, h * 0.12, h * 0.63, DARK, "generator-radiator")}
      {vent(0.16, 0.935, h * 0.22, 0.68, h * 0.43)}
      {vent(0.905, 0.18, h * 0.23, 0.22, h * 0.3, "right")}
      {box(0.08, 0.05, 0.84, 0.7, h * 0.7, h * 0.055, palette, "generator-roof")}
      {fan(0.5, 0.28, h * 0.76, s * 0.2)}
      {fan(0.5, 0.57, h * 0.76, s * 0.2)}
      {line([0.74, 0.13, h * 0.76], [0.74, 0.13, h * 0.96], "#718b9b", s * 0.075)}
      {line([0.74, 0.13, h * 0.96], [0.87, 0.13, h * 0.96], "#8fa6b3", s * 0.075)}
      {polygon([[0.902, 0.51, h * 0.34], [0.902, 0.66, h * 0.34], [0.902, 0.66, h * 0.55], [0.902, 0.51, h * 0.55]], "#bfd0d9")}
    </>;
  } else if (kind === "lvTransformer") {
    model = <>
      {box(0.08, 0.08, 0.84, 0.84, 0, h * 0.08, BASE, "transformer-base")}
      {box(0.16, 0.16, 0.68, 0.68, h * 0.08, h * 0.66, palette, "dry-transformer-enclosure")}
      {box(0.12, 0.12, 0.76, 0.76, h * 0.74, h * 0.1, palette, "overhanging-cover")}
      {vent(0.24, 0.845, h * 0.21, 0.52, h * 0.38)}
      {vent(0.845, 0.23, h * 0.21, 0.5, h * 0.38, "right")}
      {line([0.36, 0.16, h * 0.86], [0.36, 0.3, h * 0.86], "#889fac", s * 0.06)}
      {line([0.65, 0.16, h * 0.86], [0.65, 0.3, h * 0.86], "#889fac", s * 0.06)}
    </>;
  } else if (kind === "ups") {
    model = <>
      {box(0.08, 0.06, 0.84, 0.88, 0, h * 0.07, UPS_BASE, "ups-base")}
      {box(0.1, 0.08, 0.8, 0.84, h * 0.07, h * 0.83, palette, "ups-enclosure")}
      {upsFront(true)}
      {vent(0.19, 0.924, h * 0.2, 0.62, h * 0.22)}
      {vent(0.19, 0.924, h * 0.65, 0.62, h * 0.15)}
      {box(0.08, 0.06, 0.84, 0.88, h * 0.9, h * 0.035, palette, "ups-roof")}
    </>;
  } else {
    model = <>
      {box(0.12, 0.1, 0.76, 0.8, 0, h * 0.07, DARK, "cabinet-plinth")}
      {box(0.12, 0.12, 0.76, 0.74, h * 0.07, h * 0.83, palette, "cabinet-enclosure")}
      {door(0.17, 0.864, 0.66, h * 0.12, h * 0.72)}
      {box(0.1, 0.1, 0.8, 0.78, h * 0.9, h * 0.035, palette, "cabinet-roof")}
    </>;
  }
  return <g data-device-model={kind} data-device-detail="full">
    <polygon points={svgPoints(base.map((point) => ({ x: point.x + s * 0.16, y: point.y + s * 0.1 })))} fill="#526a78" opacity={0.12} />
    {model}
    {showLabel ? <text pointerEvents="none" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="hanging"
      fontSize={labelSize} fill="#344c5c" paintOrder="stroke" stroke="#ffffff" strokeWidth={labelSize * 0.32} strokeLinejoin="round">
      {labelText}
    </text> : null}
  </g>;
});

export const IsometricEquipment = memo(function IsometricEquipment({ record, status, selected, detailed = true, showLabel = true, compact = false }: {
  record: LayoutEquipmentRecord; status: LayoutStatus; selected: boolean; detailed?: boolean; showLabel?: boolean; compact?: boolean;
}) {
  return <g data-device-kind={layoutDeviceKind(record)}>
    {selected ? <polygon points={svgPoints(projectedRectPoints(insetEquipmentRect(record.rect)))}
      fill="#dbeafe" fillOpacity={0.35} stroke="#2563eb" strokeWidth={0.7} /> : null}
    <EquipmentModel record={record} status={status} detailed={detailed} showLabel={showLabel} compact={compact} />
  </g>;
});
