import type { LayoutEquipmentRecord, LayoutPlanManifest, LayoutRegionRecord, PowerPlanPoint, PowerPlanRect } from "../types/data";
import { isNearbyCable, isUndergroundCable, layoutCableLanes, layoutCableMarkerPoint, layoutCablePath, layoutConnectionBounds,
  layoutDeviceHeight, layoutExternalCableKind, placedLayoutCables, projectedLayoutBounds, projectedLayoutRoomLabel,
  routeLayoutCrossFloorCables, type PlacedLayoutCable } from "./layoutIsometricUtils";
import { layoutBounds, visibleLayoutEquipment, visibleLayoutRegions } from "./layoutPlanUtils";
import { routeLayoutCables } from "./layoutCableRouting";

export const ALL_LAYOUT_FLOORS = "all-floors";

/** Give the main outdoor generator row clearance below the buried MV ducts. */
export function isometricLayoutEquipment(rows: LayoutEquipmentRecord[]): LayoutEquipmentRecord[] {
  return rows.map((row) => row.fixed && /^GEN6-\d/i.test(row.equipment_key.replace(/^IAD06-/i, ""))
    ? { ...row, rect: { ...row.rect, x: row.rect.x + 60, y: row.rect.y + 60 } } : row);
}

export interface LayoutSceneGroup {
  id: string;
  label: string;
  rect: PowerPlanRect;
  offsetY: number;
  labelPosition: PowerPlanPoint;
  groundRect?: PowerPlanRect;
}

/** A shared plan footprint aligns the two decks and excludes the outdoor equipment. */
export function layoutFloorFootprint(manifest: LayoutPlanManifest): PowerPlanRect {
  return layoutBounds(manifest.floors.flatMap((floor) => [
    ...visibleLayoutEquipment(manifest, floor.floor_id).filter((row) => !row.fixed),
    ...visibleLayoutRegions(manifest, floor.floor_id).filter((region) => !region.fixed),
  ]));
}

export function layoutCableGeometry(connections: PlacedLayoutCable[]) {
  const lanes = layoutCableLanes(connections);
  return connections.map((connection, index) => ({ connection,
    path: layoutCablePath(connection, lanes[index]),
    route: isUndergroundCable(connection.cable) ? "underground" as const : !connection.externalRoute && !connection.corridorRoute && (connection.externalKind === "shared-feed" || !connection.externalKind && !connection.roomToOverhead && isNearbyCable(connection)) ? "arc" as const : "long" as const,
    markerPoint: layoutCableMarkerPoint(connection, lanes[index]),
    zone: connection.source.fixed && connection.target.fixed ? "fixed" as const
      : connection.source.fixed || connection.target.fixed ? "mixed" as const : "room" as const,
    extent: layoutConnectionBounds(connection, lanes[index]),
  }));
}

/** Equal x/y plan translation produces a purely vertical shift in the 2:1 projection. */
function translateRect(rect: PowerPlanRect, offsetY: number): PowerPlanRect {
  return { ...rect, x: rect.x + offsetY, y: rect.y + offsetY };
}

/** A display-only exploded scene. Source records and published coordinates are never modified. */
export function buildCombinedLayoutScene(manifest: LayoutPlanManifest) {
  const baseId = manifest.floors[0]?.floor_id ?? "";
  const shared = isometricLayoutEquipment(visibleLayoutEquipment(manifest, baseId).filter((row) => row.fixed));
  const sharedRegions = visibleLayoutRegions(manifest, baseId).filter((region) => region.fixed);
  const rows: LayoutEquipmentRecord[] = [...shared];
  const regions: LayoutRegionRecord[] = [...sharedRegions];
  const groups: LayoutSceneGroup[] = [];
  const singleFloorConnections = new Map<string, PlacedLayoutCable[]>();
  const floorFootprint = layoutFloorFootprint(manifest);
  const localRecords = manifest.floors.flatMap((floor) => visibleLayoutEquipment(manifest, floor.floor_id).filter((row) => !row.fixed));
  const roomDepth = Math.max(0, ...manifest.floors.flatMap((floor) => (floor.regions ?? []).filter((region) => region.kind === "room").map((region) => region.rect.height)));
  const tallestDevice = Math.max(0, ...localRecords.map(layoutDeviceHeight));
  // Separate the occupied room strips rather than the full, mostly empty floor bounds.
  const floorLift = Math.max(120, Math.ceil((roomDepth + tallestDevice + 80) / 20) * 20);
  manifest.floors.forEach((floor, index) => {
    const localRows = visibleLayoutEquipment(manifest, floor.floor_id).filter((row) => !row.fixed)
      .map((row) => ({ ...row, source_floor_id: floor.floor_id }));
    const localRegions = visibleLayoutRegions(manifest, floor.floor_id).filter((region) => !region.fixed);
    const floorRegions = [...localRegions, ...sharedRegions];
    const floorPlaced = placedLayoutCables(manifest.cables ?? [], [...localRows, ...shared], floorRegions).map((connection) =>
      layoutExternalCableKind(connection, baseId) === "shared-feed" ? { ...connection, externalKind: "shared-feed" as const } : connection);
    const floorConnections = routeLayoutCables(floorPlaced, floorRegions, new Map());
    singleFloorConnections.set(floor.floor_id, floorConnections);
    const localConnections = floorConnections.filter((connection) => !connection.source.fixed && !connection.target.fixed);
    const lanes = layoutCableLanes(localConnections);
    const frame = layoutBounds([
      ...localRows.map((row) => ({ rect: projectedLayoutBounds(row.rect, layoutDeviceHeight(row) + 4) })),
      ...localRegions.map((region) => ({ rect: projectedLayoutBounds(region.rect) })),
      ...localRegions.filter((region) => region.kind === "room").map(projectedLayoutRoomLabel),
      ...localConnections.map((connection, i) => ({ rect: layoutConnectionBounds(connection, lanes[i]) })),
    ]);
    const offsetY = index ? groups[index - 1].offsetY - floorLift : 0;
    const leftRoom = localRegions.filter((region) => region.kind === "room").map((region) => projectedLayoutBounds(region.rect))
      .sort((a, b) => a.x - b.x)[0];
    groups.push({ id: floor.floor_id, label: floor.label, rect: { ...frame, y: frame.y + offsetY }, offsetY,
      groundRect: translateRect(floorFootprint, offsetY),
      labelPosition: leftRoom ? { x: leftRoom.x - 8, y: leftRoom.y + offsetY - 12 } : { x: frame.x + 10, y: frame.y + offsetY + 23 } });
    rows.push(...localRows.map((row) => ({ ...row, rect: translateRect(row.rect, offsetY) })));
    regions.push(...localRegions.map((region) => ({ ...region, rect: translateRect(region.rect, offsetY) })));
  });
  if (shared.length || sharedRegions.length) {
    const rect = layoutBounds([...shared.map((row) => ({ rect: projectedLayoutBounds(row.rect, layoutDeviceHeight(row) + 4) })),
      ...sharedRegions.map((region) => ({ rect: projectedLayoutBounds(region.rect) }))]);
    groups.push({ id: "shared", label: "Shared Outdoor Equipment", offsetY: 0, rect,
      labelPosition: { x: rect.x + 10, y: rect.y + 23 } });
  }
  const headings = groups.map((group) => ({ rect: { x: group.labelPosition.x, y: group.labelPosition.y - 19,
    width: group.label.length * 11, height: 24 } }));
  const grounds = groups.flatMap((group) => group.groundRect ? [{ rect: projectedLayoutBounds(group.groundRect, -3) }] : []);
  const contentBounds = layoutBounds([...groups, ...headings, ...grounds]);
  const placed = placedLayoutCables(manifest.cables ?? [], rows, regions).map((connection) => {
    const externalKind = layoutExternalCableKind(connection, baseId);
    return externalKind ? { ...connection, externalKind, roomToOverhead: false, overheadRoom: undefined } : connection;
  });
  const offsets = new Map(groups.map((group) => [group.id, group.offsetY]));
  const connections = routeLayoutCables(routeLayoutCrossFloorCables(placed, regions, offsets), regions, offsets);
  const geometry = layoutCableGeometry(connections);
  const bounds = layoutBounds([...groups, ...headings, ...grounds, ...geometry.map(({ extent }) => ({ rect: extent }))]);
  return { rows, regions, groups, connections, geometry, bounds, contentBounds, floorLift, floorFootprint, singleFloorConnections };
}
