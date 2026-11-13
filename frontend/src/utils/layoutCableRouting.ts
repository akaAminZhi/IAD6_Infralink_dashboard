import type { LayoutEquipmentRecord, LayoutRegionRecord, PowerPlanPoint } from "../types/data";
import { isUndergroundCable, layoutCableLanes, layoutCablePath, layoutDeviceHeight, projectLayoutPoint, type PlacedLayoutCable } from "./layoutIsometricUtils";

const center = (row: LayoutEquipmentRecord) => ({ x: row.rect.x + row.rect.width / 2, y: row.rect.y + row.rect.height / 2 });
const roof = (row: LayoutEquipmentRecord) => { const p = center(row); return projectLayoutPoint(p.x, p.y, layoutDeviceHeight(row)); };

function containingRoom(row: LayoutEquipmentRecord, rooms: LayoutRegionRecord[]) {
  const p = center(row);
  return rooms.find((room) => !row.fixed && room.source_floor_id === row.source_floor_id &&
    p.x >= room.rect.x && p.x <= room.rect.x + room.rect.width && p.y >= room.rect.y && p.y <= room.rect.y + room.rect.height);
}

interface Segment { a: PowerPlanPoint; b: PowerPlanPoint; index: number }
const cross = (a: PowerPlanPoint, b: PowerPlanPoint, c: PowerPlanPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: PowerPlanPoint, b: PowerPlanPoint, c: PowerPlanPoint, d: PowerPlanPoint) {
  return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) &&
    cross(a, b, c) * cross(a, b, d) < -1e-7 && cross(c, d, a) * cross(c, d, b) < -1e-7;
}

function selfCrosses(points: PowerPlanPoint[]) {
  for (let i = 1; i < points.length; i++) for (let j = i + 2; j < points.length; j++)
    if (intersects(points[i - 1], points[i], points[j - 1], points[j])) return true;
  return false;
}

/** Sample the actual path commands, including the rounded elbows used by the renderer. */
function pathPoints(path: string): PowerPlanPoint[] {
  const tokens = path.match(/[MLQC]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? [];
  const points: PowerPlanPoint[] = [];
  let i = 0;
  const point = () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M" || command === "L") points.push(point());
    else {
      const start = points[points.length - 1], a = point(), b = point(), c = command === "C" ? point() : b;
      const steps = command === "C" ? 12 : 2;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, s = 1 - t;
        points.push(command === "C" ? { x: s ** 3 * start.x + 3 * s * s * t * a.x + 3 * s * t * t * b.x + t ** 3 * c.x,
          y: s ** 3 * start.y + 3 * s * s * t * a.y + 3 * s * t * t * b.y + t ** 3 * c.y }
          : { x: s * s * start.x + 2 * s * t * a.x + t * t * b.x, y: s * s * start.y + 2 * s * t * a.y + t * t * b.y });
      }
    }
  }
  return points;
}

/** Deterministic crossing reduction with fixed ports and a bounded set of aisle choices. */
function chooseRoutes(connections: PlacedLayoutCable[], candidates: ReadonlyMap<string, PlacedLayoutCable[]>): PlacedLayoutCable[] {
  if (!candidates.size) return connections;
  const lanes = layoutCableLanes(connections);
  const current = [...connections];
  const grid = new Map<string, Set<Segment>>();
  const inserted: { key: string; segment: Segment }[][] = connections.map(() => []);
  const points = connections.map((c, index) => pathPoints(layoutCablePath(c, lanes[index])));
  const cells = (a: PowerPlanPoint, b: PowerPlanPoint) => {
    const keys: string[] = [];
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return keys;
    let x = Math.floor(a.x / 32), y = Math.floor(a.y / 32);
    const endX = Math.floor(b.x / 32), endY = Math.floor(b.y / 32);
    const dx = b.x - a.x, dy = b.y - a.y, stepX = Math.sign(dx), stepY = Math.sign(dy);
    const deltaX = dx ? 32 / Math.abs(dx) : Number.POSITIVE_INFINITY, deltaY = dy ? 32 / Math.abs(dy) : Number.POSITIVE_INFINITY;
    let nextX = dx ? ((stepX > 0 ? x + 1 : x) * 32 - a.x) / dx : Number.POSITIVE_INFINITY;
    let nextY = dy ? ((stepY > 0 ? y + 1 : y) * 32 - a.y) / dy : Number.POSITIVE_INFINITY;
    keys.push(`${x},${y}`);
    while (x !== endX || y !== endY) {
      if (y === endY || x !== endX && nextX < nextY) { x += stepX; nextX += deltaX; }
      else { y += stepY; nextY += deltaY; }
      keys.push(`${x},${y}`);
    }
    return keys;
  };
  const insert = (index: number) => {
    if (isUndergroundCable(current[index].cable)) return;
    for (let j = 1; j < points[index].length; j++) {
      const segment = { a: points[index][j - 1], b: points[index][j], index };
      for (const key of cells(segment.a, segment.b)) {
        const bucket = grid.get(key) ?? new Set<Segment>(); bucket.add(segment); grid.set(key, bucket); inserted[index].push({ key, segment });
      }
    }
  };
  points.forEach((_, index) => insert(index));
  const countCrossings = (route: PowerPlanPoint[], index: number) => {
    const crossed = new Set<number>();
    for (let j = 1; j < route.length; j++) {
      const seen = new Set<Segment>();
      for (const key of cells(route[j - 1], route[j])) {
        for (const segment of grid.get(key) ?? []) {
          if (segment.index === index || crossed.has(segment.index) || seen.has(segment)) continue;
          seen.add(segment);
          if (intersects(route[j - 1], route[j], segment.a, segment.b)) crossed.add(segment.index);
        }
      }
    }
    return crossed.size;
  };
  const length = (route: PowerPlanPoint[]) => route.slice(1).reduce((sum, p, index) => sum + Math.hypot(p.x - route[index].x, p.y - route[index].y), 0);
  const indexes = new Map(connections.map((c, index) => [c.cable.cable_id, index]));
  const choices = [...candidates].map(([id, variants]) => {
    const index = indexes.get(id)!;
    return { index, variants: variants.map((connection) => {
      const route = pathPoints(layoutCablePath(connection, lanes[index]));
      return { connection, route, length: length(route) };
    }).filter(({ route }) => !selfCrosses(route)) };
  }).sort((a, b) => connections[a.index].cable.cable_id.localeCompare(connections[b.index].cable.cable_id));
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const { index, variants } of choices) {
      let best = { connection: current[index], route: points[index], length: length(points[index]) };
      let bestScore = variants.some((variant) => variant.connection === current[index]) ? countCrossings(best.route, index) * 1e6 + best.length : Number.POSITIVE_INFINITY;
      for (const variant of variants) {
        const score = countCrossings(variant.route, index) * 1e6 + variant.length;
        if (score < bestScore - 1e-6) { best = variant; bestScore = score; }
      }
      if (best.connection !== current[index]) {
        for (const { key, segment } of inserted[index]) grid.get(key)!.delete(segment);
        inserted[index] = [];
        current[index] = best.connection; points[index] = best.route; insert(index); changed = true;
      }
    }
    if (!changed) break;
  }
  return current;
}

/** Keep equipment pinned; fan related feeders along ordered, parallel aisle tracks. */
function roomRouteCandidates(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[]) {
  const rooms = regions.filter((region) => region.kind === "room" && !region.fixed);
  const candidates = connections.filter((c) => !isUndergroundCable(c.cable) && !c.externalKind &&
    !c.source.fixed && !c.target.fixed && !c.roomToOverhead &&
    c.source.source_floor_id === c.target.source_floor_id && containingRoom(c.source, rooms) && containingRoom(c.target, rooms));
  const degree = new Map<string, number>();
  const roomHeights = new Map<string, number>();
  for (const c of candidates) for (const row of [c.source, c.target]) {
    degree.set(row.equipment_key, (degree.get(row.equipment_key) ?? 0) + 1);
    const key = containingRoom(row, rooms)!.annotation_id;
    roomHeights.set(key, Math.max(roomHeights.get(key) ?? 0, layoutDeviceHeight(row)));
  }
  const groups = new Map<string, { hub: LayoutEquipmentRecord; room: LayoutRegionRecord; entries: PlacedLayoutCable[] }>();
  for (const c of candidates) {
    const [hub, leaf] = [c.source, c.target].sort((a, b) => (degree.get(b.equipment_key) ?? 0) - (degree.get(a.equipment_key) ?? 0) || a.equipment_key.localeCompare(b.equipment_key));
    const room = containingRoom(leaf, rooms)!;
    const key = `${hub.annotation_id}\0${room.annotation_id}`;
    const group = groups.get(key) ?? { hub, room, entries: [] };
    group.entries.push(c); groups.set(key, group);
  }
  const routes = new Map<string, PlacedLayoutCable[]>();
  for (const { hub, room, entries } of groups.values()) {
    const leafFor = (c: PlacedLayoutCable) => c.source.equipment_key === hub.equipment_key ? c.target : c.source;
    const hubRoom = containingRoom(hub, rooms)!;
    if (entries.length < 2 && hubRoom.annotation_id === room.annotation_id) continue;
    const hp = center(hub);
    const columns: PlacedLayoutCable[][] = [];
    for (const entry of [...entries].sort((a, b) => center(leafFor(a)).x - center(leafFor(b)).x || a.cable.cable_id.localeCompare(b.cable.cable_id))) {
      const column = columns[columns.length - 1];
      if (column && Math.abs(center(leafFor(column[0])).x - center(leafFor(entry)).x) <= 8) column.push(entry);
      else columns.push([entry]);
    }
    for (const column of columns) {
      const leaves = column.map(leafFor);
      const middleX = leaves.reduce((sum, row) => sum + center(row).x, 0) / leaves.length;
      const height = Math.max(roomHeights.get(hubRoom.annotation_id) ?? 0, roomHeights.get(room.annotation_id) ?? 0) + 9;
      // Near branches are inside the farther branches, so their drops do not cut the trunk.
      column.sort((a, b) => Math.abs(center(leafFor(a)).y - hp.y) - Math.abs(center(leafFor(b)).y - hp.y) || a.cable.cable_id.localeCompare(b.cable.cable_id));
      column.forEach((c, index) => {
        const leaf = leafFor(c), lp = center(leaf);
        const variants: PlacedLayoutCable[] = [];
        const preferredSide = hp.x <= middleX ? -1 : 1;
        for (const side of [preferredSide, -preferredSide]) for (const lift of [-5, 2, 12]) {
          const aisleX = side < 0 ? Math.min(...leaves.map((row) => row.rect.x)) - 2 : Math.max(...leaves.map((row) => row.rect.x + row.rect.width)) + 2;
          const trackX = aisleX + side * index * 0.7;
          const p = (x: number, y: number) => projectLayoutPoint(x, y, height + lift);
          const edges = hubRoom.annotation_id === room.annotation_id ? [null] : [Math.min(hubRoom.rect.y, room.rect.y) - 8 - index * 0.7,
            Math.max(hubRoom.rect.y + hubRoom.rect.height, room.rect.y + room.rect.height) + 8 + index * 0.7];
          for (const edge of edges) {
            const tray = edge === null ? [p(hp.x, hp.y), p(trackX, hp.y), p(trackX, lp.y), p(lp.x, lp.y)]
              : [p(hp.x, hp.y), p(hp.x, edge), p(trackX, edge), p(trackX, lp.y), p(lp.x, lp.y)];
            const points = [roof(hub), ...tray, roof(leaf)];
            variants.push({ ...c, corridorRoute: hub.equipment_key.localeCompare(leaf.equipment_key) <= 0 ? points : points.reverse() });
          }
          if (hubRoom.annotation_id === room.annotation_id) {
            const trackY = lp.y + side * (2 + index * 0.7);
            const points = [roof(hub), p(hp.x, hp.y), p(hp.x, trackY), p(lp.x, trackY), p(lp.x, lp.y), roof(leaf)];
            variants.push({ ...c, corridorRoute: hub.equipment_key.localeCompare(leaf.equipment_key) <= 0 ? points : points.reverse() });
          }
        }
        routes.set(c.cable.cable_id, variants);
      });
    }
  }
  return routes;
}

export function routeLayoutRoomCables(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[]): PlacedLayoutCable[] {
  return chooseRoutes(connections, roomRouteCandidates(connections, regions));
}

/** Plan outdoor riser banks against both front/back room approaches and both sides. */
function outdoorRouteCandidates(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[], floorOffsets: ReadonlyMap<string, number>) {
  const rooms = regions.filter((region) => region.kind === "room" && !region.fixed);
  const groups = new Map<string, { hub: LayoutEquipmentRecord; room: LayoutRegionRecord; entries: PlacedLayoutCable[] }>();
  for (const c of connections) {
    if (c.externalKind !== "shared-feed" || isUndergroundCable(c.cable)) continue;
    const hub = c.source.fixed ? c.source : c.target, leaf = c.source.fixed ? c.target : c.source;
    const room = containingRoom(leaf, rooms);
    if (!room) continue;
    const key = `${hub.annotation_id}\0${room.annotation_id}`;
    const group = groups.get(key) ?? { hub, room, entries: [] };
    group.entries.push(c); groups.set(key, group);
  }
  const routes = new Map<string, PlacedLayoutCable[]>();
  for (const { hub, room, entries } of groups.values()) {
    const hp = center(hub), offset = floorOffsets.get(room.source_floor_id) ?? 0;
    const leafFor = (c: PlacedLayoutCable) => c.source.fixed ? c.target : c.source;
    entries.sort((a, b) => center(leafFor(a)).x - center(leafFor(b)).x || center(leafFor(a)).y - center(leafFor(b)).y || a.cable.cable_id.localeCompare(b.cable.cable_id));
    const leaves = entries.map(leafFor);
    const height = Math.max(layoutDeviceHeight(hub), ...leaves.map(layoutDeviceHeight)) + 12;
    entries.forEach((c, index) => {
      const leaf = leafFor(c), lp = center(leaf), lane = index * 1.2;
      const variants: PlacedLayoutCable[] = [];
      for (const entryX of [room.rect.x - offset - 6, room.rect.x - offset + room.rect.width + 6, hp.x])
        for (const edgeY of [room.rect.y - offset + room.rect.height + 9, room.rect.y - offset - 9])
          for (const extraHeight of [0, 16, 36, 60]) {
            const project = (x: number, y: number, lift = 0) => { const point = projectLayoutPoint(x, y, height + extraHeight); return { x: point.x, y: point.y + lift }; };
            const x = entryX - lane, y = edgeY + lane;
            const trunk = [roof(hub), project(entryX, hp.y), project(entryX, edgeY), project(entryX, edgeY, offset)];
            const points = [roof(hub), project(hp.x, hp.y), project(x, hp.y), project(x, y), project(x, y, offset),
              project(lp.x - offset, y, offset), project(lp.x - offset, lp.y - offset, offset), roof(leaf)];
            variants.push({ ...c, externalRoute: { points: hub.equipment_key.localeCompare(leaf.equipment_key) <= 0 ? points : points.reverse(),
              trunk, bundleLane: lane, hubEquipmentKey: hub.equipment_key } });
          }
      routes.set(c.cable.cable_id, variants);
    });
  }
  return routes;
}

/**
 * Room-to-panel feeders share one overhead tray per floor: a common run along the
 * rooms' back edge, one trunk per aligned panel column, and a drop above each panel.
 */
export function routeLayoutPanelTrays(connections: PlacedLayoutCable[]): PlacedLayoutCable[] {
  const floors = new Map<string, { connection: PlacedLayoutCable; index: number; indoor: LayoutEquipmentRecord; outdoor: LayoutEquipmentRecord }[]>();
  connections.forEach((connection, index) => {
    const room = connection.overheadRoom;
    if (!connection.roomToOverhead || !room || connection.externalKind || isUndergroundCable(connection.cable)) return;
    const { source, target } = connection, p = center(source);
    const sourceInRoom = p.x >= room.rect.x && p.x <= room.rect.x + room.rect.width && p.y >= room.rect.y && p.y <= room.rect.y + room.rect.height;
    const [indoor, outdoor] = sourceInRoom ? [source, target] : [target, source];
    const entries = floors.get(indoor.source_floor_id) ?? [];
    entries.push({ connection, index, indoor, outdoor }); floors.set(indoor.source_floor_id, entries);
  });
  if (!floors.size) return connections;
  const routed = [...connections];
  for (const entries of floors.values()) {
    const height = Math.max(...entries.flatMap(({ indoor, outdoor }) => [layoutDeviceHeight(indoor), layoutDeviceHeight(outdoor)])) + 18;
    const edgeY = Math.min(...entries.map(({ connection }) => connection.overheadRoom!.rect.y)) - 12;
    // Panels standing in one line share a single column trunk.
    const columns: number[][] = [];
    for (const x of entries.map(({ outdoor }) => center(outdoor).x).sort((a, b) => a - b)) {
      const column = columns[columns.length - 1];
      if (column && x - column[0] <= 8) column.push(x); else columns.push([x]);
    }
    const trunkX = (x: number) => {
      const column = columns.find((values) => x >= values[0] && x <= values[values.length - 1])!;
      return column.reduce((sum, value) => sum + value, 0) / column.length;
    };
    for (const { connection, index, indoor, outdoor } of entries) {
      const ip = center(indoor), op = center(outdoor), columnX = trunkX(op.x);
      const trayY = Math.max(op.y, edgeY);
      const p = (x: number, y: number) => projectLayoutPoint(x, y, height);
      // A sub-unit jog off the trunk would fold over its own drop in projection; drop straight instead.
      const overPanel = Math.abs(op.x - columnX) > 1 ? [p(op.x, op.y)] : [];
      const points = [roof(indoor), p(ip.x, ip.y), p(ip.x, trayY), p(columnX, trayY), p(columnX, op.y), ...overPanel, roof(outdoor)];
      routed[index] = { ...connection, corridorRoute: indoor.equipment_key.localeCompare(outdoor.equipment_key) <= 0 ? points : points.reverse() };
    }
  }
  return routed;
}

/** Optimize indoor aisles and outdoor riser banks together, once per scene change. */
export function routeLayoutCables(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[], floorOffsets: ReadonlyMap<string, number>): PlacedLayoutCable[] {
  const trays = routeLayoutPanelTrays(connections);
  return chooseRoutes(trays, new Map([...roomRouteCandidates(trays, regions), ...outdoorRouteCandidates(trays, regions, floorOffsets)]));
}
