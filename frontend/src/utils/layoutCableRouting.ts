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
  const candidates = connections.filter((c) => !c.corridorRoute && !isUndergroundCable(c.cable) && !c.externalKind &&
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
    if (c.externalKind !== "shared-feed" || c.externalRoute || isUndergroundCable(c.cable)) continue;
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

interface TrayEnd { row: LayoutEquipmentRecord; offset: number; x: number; y: number; inRoom: boolean }

/**
 * One overhead tray network for room feeders, so related cables merge instead of fanning out:
 * - a back-edge run behind the rooms with one trunk per aligned panel column (room-to-panel feeders);
 * - a front-edge run in front of the rooms (feeders between rooms);
 * Each cable leaves its device straight up, follows the shared runs, and drops onto the far device.
 * Cross-floor feeders merge only per source device: each hub device gets its own lane and riser in
 * front of it (outdoor feeds instead rise in front of the upper-floor device they serve), so the
 * devices with cross-floor connections stay easy to spot.
 * Plan coordinates are floor-local; `floorOffsets` restores each floor's exploded screen position.
 */
export function routeLayoutTrays(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[], floorOffsets: ReadonlyMap<string, number>): PlacedLayoutCable[] {
  const rooms = regions.filter((region) => region.kind === "room" && !region.fixed);
  const offsetOf = (floor: string) => floorOffsets.get(floor) ?? 0;
  const end = (row: LayoutEquipmentRecord): TrayEnd => {
    const offset = offsetOf(row.source_floor_id), p = center(row);
    return { row, offset, x: p.x - offset, y: p.y - offset, inRoom: Boolean(containingRoom(row, rooms)) };
  };
  const entries = connections.flatMap((connection, index) => {
    const { cable, source, target } = connection;
    if (isUndergroundCable(cable)) return [];
    const a = end(source), b = end(target);
    if (source.fixed || target.fixed) {
      // Outdoor feeds into a room on an exploded upper floor get their own riser.
      const outdoorRiser = connection.externalKind === "shared-feed" && source.fixed !== target.fixed && a.offset !== b.offset && (a.inRoom || b.inRoom);
      return outdoorRiser ? [{ connection, index, a, b, crossFloor: true }] : [];
    }
    const crossFloor = source.source_floor_id !== target.source_floor_id;
    const betweenRooms = a.inRoom && b.inRoom && containingRoom(source, rooms)!.annotation_id !== containingRoom(target, rooms)!.annotation_id;
    const keep = crossFloor ? connection.externalKind === "cross-floor"
      : !connection.externalKind && (Boolean(connection.roomToOverhead && connection.overheadRoom) || betweenRooms);
    return keep ? [{ connection, index, a, b, crossFloor }] : [];
  });
  if (!entries.length) return connections;
  // Without room outlines, the tray runs bound the routed devices themselves.
  const extents = rooms.length ? rooms.map(({ rect, source_floor_id }) => { const o = offsetOf(source_floor_id);
    return { x: rect.x - o, y: rect.y - o, bottom: rect.y + rect.height - o }; })
    : entries.flatMap(({ a, b }) => [a, b]).filter((e) => !e.row.fixed).map((e) => ({ x: e.x, y: e.y, bottom: e.y }));
  const roomTop = Math.min(...extents.map((room) => room.y));
  const backY = roomTop - 12, frontY = Math.max(...extents.map((room) => room.bottom)) + 12;
  const behind = (e: TrayEnd) => !e.row.fixed && !e.inRoom && e.y < roomTop;
  const height = Math.max(...entries.flatMap(({ a, b }) => [a, b]).filter((e) => !e.row.fixed).map((e) => layoutDeviceHeight(e.row))) + 18;
  // Panels standing in one line on a floor share a single column trunk.
  const columns = new Map<string, number[][]>();
  for (const e of entries.flatMap(({ a, b }) => [a, b]).filter(behind).sort((p, q) => p.x - q.x)) {
    const floor = columns.get(e.row.source_floor_id) ?? [], column = floor[floor.length - 1];
    if (column && e.x - column[0] <= 8) { if (!column.includes(e.x)) column.push(e.x); } else floor.push([e.x]);
    columns.set(e.row.source_floor_id, floor);
  }
  const trunkX = (e: TrayEnd) => {
    const column = columns.get(e.row.source_floor_id)!.find((values) => e.x >= values[0] && e.x <= values[values.length - 1])!;
    return column.reduce((sum, value) => sum + value, 0) / column.length;
  };
  const at = (e: TrayEnd, x: number, y: number, z = height) => { const p = projectLayoutPoint(x, y, z); return { x: p.x, y: p.y + e.offset }; };
  /** Tray points from the run at `lineY` to the point above the device. */
  const leg = (e: TrayEnd, lineY: number) => {
    if (!behind(e)) return [at(e, e.x, lineY), at(e, e.x, e.y)];
    const x = trunkX(e);
    // A sub-unit jog off the trunk would fold over its own drop in projection; drop straight instead.
    return [at(e, x, lineY), at(e, x, e.y), ...Math.abs(e.x - x) > 1 ? [at(e, e.x, e.y)] : []];
  };
  const degree = new Map<string, number>();
  const crossEntries = entries.filter(({ crossFloor }) => crossFloor);
  for (const { connection, a, b } of crossEntries) if (connection.externalKind === "cross-floor")
    for (const e of [a, b]) degree.set(e.row.equipment_key, (degree.get(e.row.equipment_key) ?? 0) + 1);
  // Outdoor equipment is always the hub of its feed; otherwise the shared endpoint is,
  // with ties going to the upper floor, then the equipment ID.
  const hubOf = (a: TrayEnd, b: TrayEnd) => [a, b].sort((p, q) => Number(q.row.fixed) - Number(p.row.fixed) ||
    (degree.get(q.row.equipment_key) ?? 0) - (degree.get(p.row.equipment_key) ?? 0) ||
    p.offset - q.offset || p.row.equipment_key.localeCompare(q.row.equipment_key));
  // One lane per hub device (outdoor and indoor hubs counted separately): cables leaving the same
  // device share its riser/run and split only at their destinations; different devices never merge.
  const hubKeys = [...new Set(crossEntries.map(({ a, b }) => hubOf(a, b)[0]))].sort((p, q) => p.row.equipment_key.localeCompare(q.row.equipment_key));
  const lanes = new Map<string, number>();
  let deviceLanes = 0, outdoorLanes = 0;
  for (const hub of hubKeys) if (!lanes.has(hub.row.equipment_key)) lanes.set(hub.row.equipment_key, (hub.row.fixed ? outdoorLanes++ : deviceLanes++) * 2);
  const routed = [...connections];
  for (const { connection, index, a, b, crossFloor } of entries) {
    const lineY = behind(a) || behind(b) ? backY : frontY;
    if (!crossFloor) {
      const forward = [roof(a.row), ...leg(a, lineY).reverse(), ...leg(b, lineY), roof(b.row)];
      routed[index] = { ...connection, corridorRoute: a.row.equipment_key.localeCompare(b.row.equipment_key) <= 0 ? forward : forward.reverse() };
      continue;
    }
    const [hub, other] = hubOf(a, b), lane = lanes.get(hub.row.equipment_key) ?? 0;
    let fromHub: PowerPlanPoint[];
    if (hub.row.fixed) {
      // Outdoor feed: run at outdoor level to just in front of the upper-floor device, climb, then go straight in.
      const z = Math.max(height, layoutDeviceHeight(hub.row) + 6), y = hub.y - 4 - lane;
      fromHub = [roof(hub.row), at(hub, hub.x, hub.y, z), at(hub, hub.x, y, z), at(hub, other.x, y, z),
        at(other, other.x, y), at(other, other.x, other.y), roof(other.row)];
    } else {
      // Device-to-device: climb in front of (or, for a panel, beside the back run of) the hub device.
      const y = behind(hub) ? backY - 4 - lane : frontY + 4 + lane;
      fromHub = [roof(hub.row), at(hub, hub.x, hub.y), at(hub, hub.x, y), at(other, hub.x, y),
        at(other, other.x, y), at(other, other.x, other.y), roof(other.row)];
    }
    const points = hub.row.equipment_key.localeCompare(other.row.equipment_key) <= 0 ? fromHub : [...fromHub].reverse();
    const trunk = fromHub.slice(0, 2).concat(fromHub.slice(hub.row.fixed ? 3 : 2, hub.row.fixed ? 5 : 4));
    routed[index] = { ...connection, externalRoute: { points, trunk, bundleLane: lane, hubEquipmentKey: hub.row.equipment_key } };
  }
  return routed;
}

/** Optimize indoor aisles and outdoor riser banks together, once per scene change. */
export function routeLayoutCables(connections: PlacedLayoutCable[], regions: LayoutRegionRecord[], floorOffsets: ReadonlyMap<string, number>): PlacedLayoutCable[] {
  const trays = routeLayoutTrays(connections, regions, floorOffsets);
  return chooseRoutes(trays, new Map([...roomRouteCandidates(trays, regions), ...outdoorRouteCandidates(trays, regions, floorOffsets)]));
}
