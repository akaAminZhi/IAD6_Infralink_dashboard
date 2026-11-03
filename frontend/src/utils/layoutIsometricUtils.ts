import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutRegionRecord, PowerPlanPoint, PowerPlanRect } from "../types/data";
import { insetEquipmentRect } from "./layoutPlanUtils";

export const LAYOUT_VIEW_KEY = "iad6-layout-view-v1";
export type LayoutDeviceKind = "mvTransformer" | "utility" | "generator" | "lvTransformer" | "ups" | "cabinet";

export const DEVICE_KIND_LABELS: Record<LayoutDeviceKind, string> = {
  mvTransformer: "MV transformer", utility: "MV switchgear", generator: "Generator",
  lvTransformer: "LV transformer", ups: "UPS system", cabinet: "Electrical cabinet",
};

export function layoutDeviceKind(record: LayoutEquipmentRecord): LayoutDeviceKind {
  const key = record.equipment_key.replace(/^IAD06-/i, "").toUpperCase();
  if (/^TX6(?:-|$)/.test(key)) return "mvTransformer";
  if (/^UTILITY/.test(key)) return "utility";
  if (/^GEN6(?:-|$)/.test(key)) return "generator";
  if (/^TX(?:-|$)/.test(key)) return "lvTransformer";
  if (/^UPS6(?:-|$)/.test(key)) return "ups";
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

/** Horizontal room callout beyond the back edge, clear of cabinet roofs. */
export function projectedLayoutRoomLabel(region: LayoutRegionRecord) {
  const centerX = region.rect.x + region.rect.width / 2;
  const anchor = projectLayoutPoint(centerX, region.rect.y);
  const center = projectLayoutPoint(centerX, region.rect.y - 60);
  const fontSize = 8;
  const width = region.label.length * fontSize * 0.65 + fontSize;
  const height = fontSize + 4;
  return { region, anchor, fontSize, rect: { x: center.x - width / 2, y: center.y - height / 2, width, height } };
}

export interface PlacedLayoutCable {
  cable: LayoutCableRecord;
  source: LayoutEquipmentRecord;
  target: LayoutEquipmentRecord;
  roomToOverhead?: boolean;
  overheadRoom?: LayoutRegionRecord;
}

export function placedLayoutCables(cables: LayoutCableRecord[], rows: LayoutEquipmentRecord[], regions: LayoutRegionRecord[] = []): PlacedLayoutCable[] {
  const placements = new Map<string, LayoutEquipmentRecord[]>();
  for (const row of rows) placements.set(row.equipment_key, [...(placements.get(row.equipment_key) ?? []), row]);
  const rooms = regions.filter((region) => region.kind === "room");
  const containingRoom = (row: LayoutEquipmentRecord) => {
    const x = row.rect.x + row.rect.width / 2, y = row.rect.y + row.rect.height / 2;
    return rooms.find(({ rect }) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
  };
  return cables.flatMap((cable) => {
    const sources = placements.get(cable.source_equipment_key ?? "") ?? [];
    const targets = placements.get(cable.target_equipment_key ?? "") ?? [];
    // Repeated PDF placements have no port association. Do not choose one arbitrarily.
    if (cable.connection_status !== "resolved" || sources.length !== 1 || targets.length !== 1) return [];
    const source = sources[0], target = targets[0];
    const sourceRoom = containingRoom(source), targetRoom = containingRoom(target);
    const roomToOverhead = !source.fixed && !target.fixed && Boolean(
      sourceRoom && !targetRoom && target.rect.y + target.rect.height / 2 < sourceRoom.rect.y ||
      targetRoom && !sourceRoom && source.rect.y + source.rect.height / 2 < targetRoom.rect.y,
    );
    return [{ cable, source, target, roomToOverhead, overheadRoom: roomToOverhead ? sourceRoom ?? targetRoom : undefined }];
  });
}

export function overheadCablePoints(connection: PlacedLayoutCable, lane = 0): PowerPlanPoint[] {
  // Reversed feeder pairs share one base route before their lane offsets are applied.
  const { source, target } = connection.source.equipment_key <= connection.target.equipment_key
    ? connection : { source: connection.target, target: connection.source };
  const a = insetEquipmentRect(source.rect), b = insetEquipmentRect(target.rect);
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  const ah = layoutDeviceHeight(source), bh = layoutDeviceHeight(target);
  const roomConnection = !source.fixed && !target.fixed;
  if (connection.roomToOverhead && connection.overheadRoom) {
    const room = connection.overheadRoom.rect;
    const sourceInRoom = ax >= room.x && ax <= room.x + room.width && ay >= room.y && ay <= room.y + room.height;
    const indoor = sourceInRoom ? { x: ax, y: ay, height: ah } : { x: bx, y: by, height: bh };
    const outdoor = sourceInRoom ? { x: bx, y: by, height: bh } : { x: ax, y: ay, height: ah };
    // Leave through the room's back edge, follow that boundary toward the target,
    // then follow its equipment column rather than the open center.
    const clearance = Math.max(0, -lane);
    const height = Math.max(ah, bh) + 18 + clearance;
    const edgeY = Math.max(outdoor.y, room.y - 12 - clearance * 2);
    // Align directly above the target column: a sideways approach can cross its
    // own vertical drop in projection and adds unnecessary travel.
    const route = [projectLayoutPoint(indoor.x, indoor.y, indoor.height),
      projectLayoutPoint(indoor.x, indoor.y, height), projectLayoutPoint(indoor.x, edgeY, height),
      projectLayoutPoint(outdoor.x, edgeY, height),
      projectLayoutPoint(outdoor.x, outdoor.y, height),
      projectLayoutPoint(outdoor.x, outdoor.y, outdoor.height)];
    return sourceInRoom ? route : route.reverse();
  }
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
  if (roomConnection && !connection.roomToOverhead) {
    // Preserve the original risers and sloping tray for connections between rooms.
    const intercept = Math.min(start.y - start.x * 0.5, end.y - end.x * 0.5) - 15 + lane;
    const direction = Math.sign(end.x - start.x) || 1;
    const bend = Math.min(18, Math.abs(end.x - start.x) * 0.22);
    const trayStartX = start.x + direction * bend, trayEndX = end.x - direction * bend;
    return [start, { x: trayStartX, y: trayStartX * 0.5 + intercept },
      { x: trayEndX, y: trayEndX * 0.5 + intercept }, end];
  }
  const distance = Math.hypot(ax - bx, ay - by);
  const lift = roomConnection ? Math.max(16, Math.min(60, distance * 0.18)) : Math.max(8, Math.min(22, distance * 0.12));
  const controlY = Math.min(start.y, end.y) - lift + lane;
  return [start, { x: start.x + (end.x - start.x) * 0.28, y: controlY },
    { x: end.x - (end.x - start.x) * 0.28, y: controlY }, end];
}

/** Stable upward lanes keep paired feeders and long room branches visible. */
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
    isRoomTrayCable(connection) ? [index] : []);
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
    const hubRow = source.equipment_key === hub ? source : target;
    const other = source.equipment_key === hub ? target : source;
    const projectedX = (row: LayoutEquipmentRecord) => row.rect.x + row.rect.width / 2 - row.rect.y - row.rect.height / 2;
    // Each side of a hub fans out independently, including mirrored cabinet rows.
    const branch = `${hub}\u0000${Math.sign(projectedX(other) - projectedX(hubRow))}`;
    const indexes = roomHubs.get(branch) ?? [];
    indexes.push(index);
    roomHubs.set(branch, indexes);
  }
  for (const indexes of roomHubs.values()) {
    const span = (index: number) => {
      const { source, target } = connections[index];
      return Math.abs(source.rect.x + source.rect.width / 2 - source.rect.y - source.rect.height / 2
        - target.rect.x - target.rect.width / 2 + target.rect.y + target.rect.height / 2);
    };
    const baseIntercept = (index: number) => {
      const [, trayStart] = overheadCablePoints(connections[index]);
      return trayStart.y - trayStart.x * 0.5;
    };
    const commonIntercept = Math.min(...indexes.map(baseIntercept));
    indexes.sort((a, b) => span(a) - span(b) || connections[a].cable.cable_id.localeCompare(connections[b].cable.cable_id));
    indexes.forEach((index, position) => {
      // Farther branches pass above nearer drops instead of cutting through them.
      // Normalize different cabinet heights/depths to one parallel tray band.
      lanes[index] = commonIntercept - baseIntercept(index) - position * 2.5;
    });
  }
  const exteriorBundles = new Map<string, number[]>();
  connections.forEach((connection, index) => {
    if (!connection.roomToOverhead || !connection.overheadRoom) return;
    const key = connection.overheadRoom.annotation_id;
    const indexes = exteriorBundles.get(key) ?? [];
    indexes.push(index);
    exteriorBundles.set(key, indexes);
  });
  for (const indexes of exteriorBundles.values()) {
    indexes.sort((a, b) => connections[a].cable.cable_id.localeCompare(connections[b].cable.cable_id));
    // Keep the room's exterior feeders in distinct parallel boundary/column lanes.
    indexes.forEach((index, position) => { lanes[index] = -position * 4; });
  }
  return lanes;
}

export function isNearbyCable({ source, target }: PlacedLayoutCable): boolean {
  const a = source.rect, b = target.rect;
  const distance = Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
  return distance <= Math.max(28, Math.min(90, Math.max(a.width, a.height, b.width, b.height) * 2.4));
}

function isRoomTrayCable(connection: PlacedLayoutCable): boolean {
  return !connection.source.fixed && !connection.target.fixed && !connection.roomToOverhead && !isNearbyCable(connection);
}

function roomCableCorners([start, trayStart, trayEnd, end]: PowerPlanPoint[]): PowerPlanPoint[] {
  return [{ x: start.x, y: trayStart.y - (trayStart.x - start.x) * 0.5 },
    { x: end.x, y: trayEnd.y + (end.x - trayEnd.x) * 0.5 }];
}

/** Small rounded elbows preserve straight risers and grid-aligned tray runs. */
function roundedCablePath(points: PowerPlanPoint[]): string {
  // Aligned endpoints and short approaches can collapse consecutive tray sections.
  points = points.filter((point, i) => !i || Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) > 1e-8);
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (incoming < 1e-8 || outgoing < 1e-8) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const radius = Math.min(2.5, incoming / 4, outgoing / 4);
    const before = { x: corner.x + (previous.x - corner.x) * radius / incoming,
      y: corner.y + (previous.y - corner.y) * radius / incoming };
    const after = { x: corner.x + (next.x - corner.x) * radius / outgoing,
      y: corner.y + (next.y - corner.y) * radius / outgoing };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = points[points.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

export function layoutConnectionBounds(connection: PlacedLayoutCable, lane = 0): PowerPlanRect {
  const route = overheadCablePoints(connection, lane);
  const corners = isRoomTrayCable(connection) ? roomCableCorners(route) : [];
  const points = [...route, ...corners, ...[connection.source, connection.target].flatMap((row) =>
    [...projectedRectPoints(row.rect), ...projectedRectPoints(row.rect, layoutDeviceHeight(row) + 3)])];
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
}

export function layoutCablePath(connection: PlacedLayoutCable, lane = 0): string {
  const points = overheadCablePoints(connection, lane);
  if (connection.roomToOverhead && connection.overheadRoom) return roundedCablePath(points);
  const [a, b, c, d] = points;
  if (isRoomTrayCable(connection)) {
    const [{ y: startCornerY }, { y: endCornerY }] = roomCableCorners([a, b, c, d]);
    return `M ${a.x} ${a.y} L ${a.x} ${startCornerY + 5} Q ${a.x} ${startCornerY} ${b.x} ${b.y}` +
      ` L ${c.x} ${c.y} Q ${d.x} ${endCornerY} ${d.x} ${endCornerY + 5} L ${d.x} ${d.y}`;
  }
  return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
}

/** Anchor report warnings on the actual cable route, including its bundle lane. */
export function layoutCableMarkerPoint(connection: PlacedLayoutCable, lane = 0): PowerPlanPoint {
  const points = overheadCablePoints(connection, lane);
  if (connection.roomToOverhead && connection.overheadRoom) {
    // The longest straight tray section stays clear of rounded elbows in either direction.
    let start = points[1], end = points[2];
    for (let i = 2; i < points.length - 2; i++) {
      if (Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y) > Math.hypot(end.x - start.x, end.y - start.y)) {
        start = points[i]; end = points[i + 1];
      }
    }
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  const [a, b, c, d] = points;
  if (isRoomTrayCable(connection)) return { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  return { x: (a.x + 3 * b.x + 3 * c.x + d.x) / 8, y: (a.y + 3 * b.y + 3 * c.y + d.y) / 8 };
}
