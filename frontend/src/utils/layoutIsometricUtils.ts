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
  // Reversed feeder pairs share one base curve before their lane offsets are applied.
  const { source, target } = connection.source.equipment_key <= connection.target.equipment_key
    ? connection : { source: connection.target, target: connection.source };
  const a = insetEquipmentRect(source.rect), b = insetEquipmentRect(target.rect);
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  const ah = layoutDeviceHeight(source), bh = layoutDeviceHeight(target);
  const roomConnection = !source.fixed && !target.fixed;
  if (isNearbyCable(connection)) {
    const start = projectLayoutPoint(ax, ay, ah), end = projectLayoutPoint(bx, by, bh);
    const lift = roomConnection
      ? Math.max(8, Math.min(14, Math.hypot(ax - bx, ay - by) * 0.18))
      : Math.max(3, Math.min(12, Math.hypot(ax - bx, ay - by) * 0.18));
    const controlY = Math.min(start.y, end.y) - lift + lane;
    return [start, { x: start.x + (end.x - start.x) * 0.28, y: controlY },
      { x: end.x - (end.x - start.x) * 0.28, y: controlY }, end];
  }
  const start = projectLayoutPoint(ax, ay, ah), end = projectLayoutPoint(bx, by, bh);
  if (roomConnection) {
    // One 2:1 isometric cable-tray direction keeps distant room runs parallel above the cabinet rows.
    const intercept = Math.min(start.y - start.x * 0.5, end.y - end.x * 0.5) - 15 + lane;
    const direction = Math.sign(end.x - start.x) || 1;
    const bend = Math.min(18, Math.abs(end.x - start.x) * 0.22);
    const trayStartX = start.x + direction * bend, trayEndX = end.x - direction * bend;
    return [start, { x: trayStartX, y: trayStartX * 0.5 + intercept },
      { x: trayEndX, y: trayEndX * 0.5 + intercept }, end];
  }
  const lift = Math.max(8, Math.min(22, Math.hypot(ax - bx, ay - by) * 0.12));
  const controlY = Math.min(start.y, end.y) - lift + lane;
  return [start, { x: start.x + (end.x - start.x) * 0.28, y: controlY },
    { x: end.x - (end.x - start.x) * 0.28, y: controlY }, end];
}

/** Stable symmetric lanes keep separate cables between the same devices visible. */
export function layoutCableLanes(connections: PlacedLayoutCable[]): number[] {
  const bundles = new Map<string, number[]>();
  connections.forEach(({ source, target }, index) => {
    const pair = [source.equipment_key, target.equipment_key].sort().join("\u0000");
    const indexes = bundles.get(pair) ?? [];
    indexes.push(index);
    bundles.set(pair, indexes);
  });
  const lanes = Array(connections.length).fill(0) as number[];
  for (const indexes of bundles.values()) {
    indexes.sort((a, b) => connections[a].cable.cable_id.localeCompare(connections[b].cable.cable_id));
    indexes.forEach((index, position) => {
      const { source, target } = connections[index];
      // Every paired route rises above its endpoints; the second cable never drops below the cabinets.
      lanes[index] = indexes.length > 1 ? -(position + 1) * (source.fixed && target.fixed ? 6 : 4) : 0;
    });
  }
  const roomLongIndexes = connections.flatMap((connection, index) =>
    !connection.source.fixed && !connection.target.fixed && !isNearbyCable(connection) ? [index] : []);
  const degree = new Map<string, number>();
  for (const index of roomLongIndexes) {
    for (const key of [connections[index].source.equipment_key, connections[index].target.equipment_key]) {
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  }
  const roomHubs = new Map<string, number[]>();
  for (const index of roomLongIndexes) {
    const { source, target } = connections[index];
    const sourceDegree = degree.get(source.equipment_key) ?? 0, targetDegree = degree.get(target.equipment_key) ?? 0;
    const hub = sourceDegree > targetDegree || (sourceDegree === targetDegree && source.equipment_key < target.equipment_key)
      ? source.equipment_key : target.equipment_key;
    const indexes = roomHubs.get(hub) ?? [];
    indexes.push(index);
    roomHubs.set(hub, indexes);
  }
  for (const [hub, indexes] of roomHubs) {
    const otherX = (index: number) => {
      const { source, target } = connections[index];
      const other = source.equipment_key === hub ? target : source;
      return other.rect.x + other.rect.width / 2 - other.rect.y - other.rect.height / 2;
    };
    indexes.sort((a, b) => otherX(a) - otherX(b) || connections[a].cable.cable_id.localeCompare(connections[b].cable.cable_id));
    indexes.forEach((index, position) => { lanes[index] = -position * 2.5; });
  }
  return lanes;
}

export function isNearbyCable({ source, target }: PlacedLayoutCable): boolean {
  const a = source.rect, b = target.rect;
  const distance = Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
  return distance <= Math.max(28, Math.min(90, Math.max(a.width, a.height, b.width, b.height) * 2.4));
}

export function layoutConnectionBounds(connection: PlacedLayoutCable, lane = 0): PowerPlanRect {
  const points = [...overheadCablePoints(connection, lane), ...[connection.source, connection.target].flatMap((row) =>
    [...projectedRectPoints(row.rect), ...projectedRectPoints(row.rect, layoutDeviceHeight(row) + 3)])];
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
}

export function layoutCablePath(connection: PlacedLayoutCable, lane = 0): string {
  const [a, b, c, d] = overheadCablePoints(connection, lane);
  if (!connection.source.fixed && !connection.target.fixed && !isNearbyCable(connection)) {
    return `M ${a.x} ${a.y} L ${a.x} ${b.y + 5} Q ${a.x} ${b.y} ${b.x} ${b.y}` +
      ` L ${c.x} ${c.y} Q ${d.x} ${c.y} ${d.x} ${c.y + 5} L ${d.x} ${d.y}`;
  }
  return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
}
