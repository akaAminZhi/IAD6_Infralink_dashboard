import type { LayoutCableRecord, LayoutEquipmentRecord, PowerPlanPoint, PowerPlanRect } from "../types/data";
import { insetEquipmentRect } from "./layoutPlanUtils";

export const LAYOUT_VIEW_KEY = "iad6-layout-view-v1";
export type LayoutDeviceKind = "mvTransformer" | "utility" | "generator" | "lvTransformer" | "cabinet";

export const DEVICE_KIND_LABELS: Record<LayoutDeviceKind, string> = {
  mvTransformer: "MV transformer", utility: "MV switchgear", generator: "Generator",
  lvTransformer: "LV transformer", cabinet: "Electrical cabinet",
};

export function layoutDeviceKind(record: LayoutEquipmentRecord): LayoutDeviceKind {
  const key = record.equipment_key.replace(/^IAD06-/i, "").toUpperCase();
  if (/^TX6(?:-|$)/.test(key)) return "mvTransformer";
  if (/^UTILITY/.test(key)) return "utility";
  if (/^GEN6(?:-|$)/.test(key)) return "generator";
  if (/^TX(?:-|$)/.test(key)) return "lvTransformer";
  return "cabinet";
}

/** One orthographic 2:1 isometric grid for equipment, rooms, ports and cables. */
export function projectLayoutPoint(x: number, y: number, z = 0): PowerPlanPoint {
  return { x: x - y, y: (x + y) * 0.5 - z };
}

export function layoutDeviceHeight(record: LayoutEquipmentRecord): number {
  const kind = layoutDeviceKind(record);
  const size = Math.min(record.rect.width, record.rect.height);
  return Math.max(3.5, Math.min(kind === "generator" ? 28 : kind === "utility" ? 22 : kind === "mvTransformer" ? 20 : 14,
    size * (kind === "generator" ? 0.95 : kind === "mvTransformer" ? 1.05 : 1.35)));
}

export function projectedRectPoints(rect: PowerPlanRect, z = 0): PowerPlanPoint[] {
  return [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height]].map(([x, y]) => projectLayoutPoint(x, y, z));
}

export function svgPoints(points: PowerPlanPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function projectedLayoutBounds(rect: PowerPlanRect, height = 0): PowerPlanRect {
  const points = [...projectedRectPoints(rect), ...projectedRectPoints(rect, height)];
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
}

export interface PlacedLayoutCable {
  cable: LayoutCableRecord;
  source: LayoutEquipmentRecord;
  target: LayoutEquipmentRecord;
}

export function placedLayoutCables(cables: LayoutCableRecord[], rows: LayoutEquipmentRecord[]): PlacedLayoutCable[] {
  const placements = new Map<string, LayoutEquipmentRecord[]>();
  for (const row of rows) placements.set(row.equipment_key, [...(placements.get(row.equipment_key) ?? []), row]);
  return cables.flatMap((cable) => {
    const sources = placements.get(cable.source_equipment_key ?? "") ?? [];
    const targets = placements.get(cable.target_equipment_key ?? "") ?? [];
    // Repeated PDF placements have no port association. Do not choose one arbitrarily.
    return cable.connection_status === "resolved" && sources.length === 1 && targets.length === 1
      ? [{ cable, source: sources[0], target: targets[0] }] : [];
  });
}

export function overheadCablePoints(connection: PlacedLayoutCable, lane = 0): PowerPlanPoint[] {
  const { source, target } = connection;
  const a = insetEquipmentRect(source.rect), b = insetEquipmentRect(target.rect);
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  const ah = layoutDeviceHeight(source), bh = layoutDeviceHeight(target);
  if (isNearbyCable(connection)) {
    const start = projectLayoutPoint(ax, ay, ah), end = projectLayoutPoint(bx, by, bh);
    const lift = Math.max(3, Math.min(12, Math.hypot(ax - bx, ay - by) * 0.18));
    return [start, { x: start.x + (end.x - start.x) * 0.28, y: start.y - lift },
      { x: end.x - (end.x - start.x) * 0.28, y: end.y - lift }, end];
  }
  const elevation = Math.max(ah, bh) + 6 + (lane % 4) * 1.2;
  return [projectLayoutPoint(ax, ay, ah), projectLayoutPoint(ax, ay, elevation),
    projectLayoutPoint(bx, ay, elevation), projectLayoutPoint(bx, by, elevation), projectLayoutPoint(bx, by, bh)];
}

export function isNearbyCable({ source, target }: PlacedLayoutCable): boolean {
  const a = source.rect, b = target.rect;
  const distance = Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
  return distance <= Math.max(28, Math.min(90, Math.max(a.width, a.height, b.width, b.height) * 2.4));
}

export function layoutConnectionBounds(connection: PlacedLayoutCable): PowerPlanRect {
  const points = [...overheadCablePoints(connection, 3), ...[connection.source, connection.target].flatMap((row) =>
    [...projectedRectPoints(row.rect), ...projectedRectPoints(row.rect, layoutDeviceHeight(row) + 3)])];
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
}

export function layoutCablePath(connection: PlacedLayoutCable, lane = 0): string {
  const points = overheadCablePoints(connection, lane);
  if (isNearbyCable(connection)) {
    const [a, b, c, d] = points;
    return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
  }
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], current = points[i], next = points[i + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    if (!incoming || !outgoing) continue;
    const radius = Math.min(4, incoming * 0.35, outgoing * 0.35);
    commands.push(`L ${current.x + (previous.x - current.x) / incoming * radius} ${current.y + (previous.y - current.y) / incoming * radius}`,
      `Q ${current.x} ${current.y} ${current.x + (next.x - current.x) / outgoing * radius} ${current.y + (next.y - current.y) / outgoing * radius}`);
  }
  const last = points[points.length - 1];
  return [...commands, `L ${last.x} ${last.y}`].join(" ");
}
