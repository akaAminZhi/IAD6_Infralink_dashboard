import { memo, type ReactNode } from "react";
import type { LayoutEquipmentRecord } from "../../types/data";
import { insetEquipmentRect, type LayoutStatus } from "../../utils/layoutPlanUtils";
import { layoutDeviceHeight, layoutDeviceKind, projectLayoutPoint, projectedRectPoints, svgPoints } from "../../utils/layoutIsometricUtils";

interface EnclosurePalette { top: string; left: string; right: string }
const ENCLOSURE: EnclosurePalette = { top: "#e1ebef", left: "#acbec8", right: "#8098a6" };
const BASE: EnclosurePalette = { top: "#beced5", left: "#8fa5b1", right: "#718a99" };
const DARK: EnclosurePalette = { top: "#9bb0bd", left: "#7c95a4", right: "#5f7888" };

/** Five industrial illustrations built in the same world-space grid as their cables. */
const EquipmentModel = memo(function EquipmentModel({ record, status }: {
  record: LayoutEquipmentRecord; status: LayoutStatus;
}) {
  const rect = insetEquipmentRect(record.rect);
  const { x, y, width: w, height: d } = rect;
  const h = layoutDeviceHeight(record), kind = layoutDeviceKind(record), s = Math.min(w, d);
  const outline = "#8197a4", detail = "#5f7888", lineWidth = Math.max(0.055, Math.min(0.2, s * 0.009));
  const palette = status === "energized" ? { top: "#ffe0dd", left: "#edaaa6", right: "#d78480" }
    : status === "energizeToday" ? { top: "#fff0dd", left: "#e5c8a4", right: "#c4a27f" } : ENCLOSURE;
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
    {polygon([[u, v, z], [u + width, v, z], [u + width, v, z + height], [u, v, z + height]], "#bbccd4", { stroke: outline, strokeWidth: lineWidth })}
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
  let model: ReactNode;
  if (kind === "mvTransformer") {
    model = <>
      {box(0.08, 0.08, 0.84, 0.84, 0, h * 0.065, BASE, "transformer-skid")}
      {box(0.29, 0.19, 0.59, 0.66, h * 0.065, h * 0.54, palette, "oil-tank")}
      {box(0.06, 0.21, 0.22, 0.64, h * 0.1, h * 0.39, BASE, "radiator-bank")}
      {Array.from({ length: 8 }, (_, i) => <g key={i}>{box(0.055, 0.24 + i * 0.073, 0.23, 0.021, h * 0.11, h * 0.37, ENCLOSURE)}</g>)}
      {box(0.87, 0.53, 0.1, 0.29, h * 0.08, h * 0.36, ENCLOSURE, "connection-cabinet")}
      {box(0.31, 0.17, 0.59, 0.7, h * 0.605, h * 0.045, ENCLOSURE, "tank-lid")}
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
      {box(0.08, 0.05, 0.84, 0.7, h * 0.7, h * 0.055, ENCLOSURE, "generator-roof")}
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
      {box(0.12, 0.12, 0.76, 0.76, h * 0.74, h * 0.1, ENCLOSURE, "overhanging-cover")}
      {vent(0.24, 0.845, h * 0.21, 0.52, h * 0.38)}
      {vent(0.845, 0.23, h * 0.21, 0.5, h * 0.38, "right")}
      {line([0.36, 0.16, h * 0.86], [0.36, 0.3, h * 0.86], "#889fac", s * 0.06)}
      {line([0.65, 0.16, h * 0.86], [0.65, 0.3, h * 0.86], "#889fac", s * 0.06)}
    </>;
  } else {
    model = <>
      {box(0.12, 0.1, 0.76, 0.8, 0, h * 0.07, DARK, "cabinet-plinth")}
      {box(0.12, 0.12, 0.76, 0.74, h * 0.07, h * 0.83, palette, "cabinet-enclosure")}
      {door(0.17, 0.864, 0.66, h * 0.12, h * 0.72)}
      {box(0.1, 0.1, 0.8, 0.78, h * 0.9, h * 0.035, ENCLOSURE, "cabinet-roof")}
    </>;
  }
  const base = projectedRectPoints(rect);
  const label = p(0.5, 1.05, -Math.max(1.3, s * 0.08));
  const labelText = record.label.replace(/^IAD06-/i, "");
  const labelSize = Math.min(4, Math.max(0.9, s * 0.18), (w + d) * 1.4 / (Math.max(4, labelText.length) * 0.55));
  return <g data-device-model={kind}>
    <polygon points={svgPoints(base.map((point) => ({ x: point.x + s * 0.16, y: point.y + s * 0.1 })))} fill="#526a78" opacity={0.12} />
    {model}
    <text pointerEvents="none" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="hanging"
      fontSize={labelSize} fill="#344c5c" paintOrder="stroke" stroke="#ffffff" strokeWidth={labelSize * 0.32} strokeLinejoin="round">
      {labelText}
    </text>
  </g>;
});

export const IsometricEquipment = memo(function IsometricEquipment({ record, status, selected }: {
  record: LayoutEquipmentRecord; status: LayoutStatus; selected: boolean;
}) {
  return <g data-device-kind={layoutDeviceKind(record)}>
    {selected ? <polygon points={svgPoints(projectedRectPoints(insetEquipmentRect(record.rect)))}
      fill="#dbeafe" fillOpacity={0.35} stroke="#2563eb" strokeWidth={0.7} /> : null}
    <EquipmentModel record={record} status={status} />
  </g>;
});
