import { DailyTestHistory } from "../components/common/DailyTestHistory";
import { Box, Cable, CircleAlert, EyeOff, Hand, Maximize, MousePointer2, RotateCcw, Search, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { wheelZoomFactor } from "../utils/wheelZoom";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { NetaReportChips } from "../components/common/NetaReportChips";
import { NetaDuplicatePanel } from "../components/common/NetaDuplicatePanel";
import { EquipmentExternalLinks } from "../components/common/EquipmentExternalLinks";
import { EquipmentUpdateInfo } from "../components/common/EquipmentUpdateInfo";
import { Button } from "../components/ui/button";
import { IsometricEquipment, SimpleIsometricSymbols } from "../components/layout/IsometricEquipment";
import { FeederCableAtpReports } from "../components/layout/FeederCableAtpReports";
import { LayoutCable } from "../components/layout/LayoutCable";
import { LayoutBackground } from "../components/layout/LayoutBackground";
import { LayoutFloorGround } from "../components/layout/LayoutFloorGround";
import { useFrameState } from "../hooks/useFrameState";
import { useNetaReportManifest } from "../contexts/NetaReportManifestContext";
import { useDashboardResources } from "../contexts/DashboardResourcesContext";
import type { Equipment, LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest, PowerPlanRect } from "../types/data";
import { buildLayoutSearchEntries, searchLayoutEntries, type LayoutSearchEntry } from "../utils/layoutSearchUtils";
import { fetchJson } from "../utils/dataLoaders";
import { LAYOUT_CABLE_MISSING_REPORT_MESSAGE, LAYOUT_CABLE_TEST_STATES, layoutCableMissingReport, layoutCableTestState, type LayoutCableTestState } from "../utils/cableTestUtils";
import { getLayoutCableReportNames } from "../utils/layoutReportUtils";
import { getNetaReportNames } from "../utils/netaReports";
import { ALL_LAYOUT_FLOORS, buildCombinedLayoutScene, isometricLayoutEquipment, layoutCableGeometry, layoutFloorFootprint } from "../utils/layoutSceneUtils";
import {
  DEVICE_KIND_LABELS, LAYOUT_VIEW_KEY, layoutCableLanes, layoutConnectionBounds, layoutDeviceHeight, layoutDeviceKind,
  placedLayoutCables, projectLayoutPoint, projectedLayoutBounds, projectedLayoutRoomLabel,
} from "../utils/layoutIsometricUtils";
import {
  equipmentInLayoutSelection, insetEquipmentRect, layoutBounds, layoutCanvasPoint, layoutEquipmentStatus, layoutRoomLabels,
  layoutSelectionRect, planLayoutSelection,
  LAYOUT_OVERRIDES_KEY, LAYOUT_STATUS_COLORS, LAYOUT_STATUS_LABELS, readLayoutOverrides,
  visibleLayoutEquipment, visibleLayoutRegions, zoomLayoutViewport, type LayoutStatus,
} from "../utils/layoutPlanUtils";

const EquipmentRectangle = memo(function EquipmentRectangle({ record, status, selected, dimmed, tooltipVisible, isometric, hasIsometric, detailed, showLabel, compact, onSelect, onInspect, onLeave }: {
  record: LayoutEquipmentRecord;
  status: LayoutStatus;
  selected: boolean;
  dimmed: boolean;
  tooltipVisible: boolean;
  isometric: boolean;
  hasIsometric: boolean;
  detailed: boolean;
  showLabel: boolean;
  compact: boolean;
  onSelect: (record: LayoutEquipmentRecord) => void;
  onInspect: (record: LayoutEquipmentRecord, element: SVGGElement) => void;
  onLeave: (annotationId: string) => void;
}) {
  const { x, y, width, height } = insetEquipmentRect(record.rect);
  const colors = LAYOUT_STATUS_COLORS[status];
  const parts = record.label.replace(/^IAD06-/i, "").split("-");
  const lines = parts.length > 1 ? [parts[0], parts.slice(1).join("-")] : parts;
  const fontSize = Math.min(6, height / 3.5, width / (Math.max(...lines.map((line) => line.length)) * 0.6));
  return (
    <g role="button" tabIndex={0} aria-label={`${record.label}: ${LAYOUT_STATUS_LABELS[status]}`}
      aria-pressed={selected} data-annotation-id={record.annotation_id} data-equipment-key={record.equipment_key} data-fixed={record.fixed}
      aria-describedby={tooltipVisible ? "layout-equipment-tooltip" : undefined}
      onPointerEnter={(event) => onInspect(record, event.currentTarget)} onPointerLeave={() => onLeave(record.annotation_id)}
      onFocus={(event) => onInspect(record, event.currentTarget)} onBlur={() => onLeave(record.annotation_id)}
      onClick={() => onSelect(record)} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(record); }
      }} className="cursor-pointer outline-none focus:drop-shadow-md" opacity={dimmed ? 0.2 : 1}>
      <title>{`${record.label} · ${LAYOUT_STATUS_LABELS[status]}${record.fixed ? " · Fixed across floors" : ""}`}</title>
      {hasIsometric ? <g data-equipment-view="isometric" style={isometric ? undefined : { display: "none" }}>
        <IsometricEquipment record={record} status={status} selected={selected} detailed={detailed} showLabel={showLabel} compact={compact} />
      </g> : null}
      {!isometric ? <g data-equipment-view="plan"><rect x={x} y={y} width={width} height={height} rx={Math.min(2, width / 4, height / 4)}
        fill={colors.fill} stroke={selected ? "#2563eb" : colors.stroke} strokeWidth={selected || status === "energized" ? 0.65 : 0.35} />
      {lines.map((line, index) => <text key={index} x={x + width / 2}
        y={y + height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.15}
        textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fill="#0f172a" pointerEvents="none">{line}</text>)}</g> : null}
    </g>
  );
});

const EquipmentLightning = memo(function EquipmentLightning({ record, status, dimmed, isometric }: { record: LayoutEquipmentRecord; status: LayoutStatus; dimmed: boolean; isometric: boolean }) {
  if (status !== "energizeToday" && status !== "energized") return null;
  const { x, y, width } = insetEquipmentRect(record.rect);
  // One world-space size for both states and every 2.5D device footprint.
  const size = isometric ? 9 : Math.min(6, Math.max(3, width * 0.6));
  const color = LAYOUT_STATUS_COLORS[status].stroke;
  const anchor = isometric ? projectLayoutPoint(x + width / 2, y, layoutDeviceHeight(record)) : { x: x + width / 2, y };
  return <g transform={`translate(${anchor.x - size / 2}, ${anchor.y - size - 1})`} data-lightning-key={record.equipment_key} opacity={dimmed ? (isometric ? 0.75 : 0.2) : 1}>
    <Zap x={0} y={0} width={size} height={size} fill={color} color={color}
      className="animate-energisation-breathe" role="img" aria-label={`${record.label} ${LAYOUT_STATUS_LABELS[status]} lightning`} />
  </g>;
});

interface PanState {
  pointerId: number;
  button: number;
  x: number;
  y: number;
  viewport: PowerPlanRect;
  moved: boolean;
  annotationId: string | null;
  cableId: string | null;
  mode: "pan" | "select";
  additive: boolean;
}

function overlapsViewport(rect: PowerPlanRect, viewport: PowerPlanRect): boolean {
  return rect.x <= viewport.x + viewport.width && rect.x + rect.width >= viewport.x &&
    rect.y <= viewport.y + viewport.height && rect.y + rect.height >= viewport.y;
}

/** Legend entry that doubles as a highlight toggle; the accent colour rings the active chip. */
function LegendToggle({ pressed, accent, count, tone, disabled, controls, title, onClick, children }: {
  pressed: boolean; accent: string; count?: number; tone?: string; disabled?: boolean; controls?: string; title: string;
  onClick: () => void; children: ReactNode;
}) {
  return <button type="button" aria-pressed={pressed} aria-controls={controls} disabled={disabled} title={title} onClick={onClick}
    style={pressed ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600
      disabled:cursor-not-allowed disabled:opacity-50 ${pressed ? "bg-accent font-medium" : "border-transparent hover:bg-accent/60"} ${tone ?? ""}`}>
    {children}{count !== undefined ? <span className="tabular-nums text-muted-foreground" aria-hidden="true">{count}</span> : null}
  </button>;
}

export function LayoutPlanPage({ refreshKey = 0, equipment = [] }: { refreshKey?: number; equipment?: Equipment[] }) {
  const [isometric, setIsometric] = useState(() => {
    try { return localStorage.getItem(LAYOUT_VIEW_KEY) !== "plan"; } catch { return true; }
  });
  const [hasIsometric, setHasIsometric] = useState(isometric);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [showCables, setShowCables] = useState(true);
  const [highlightMissingReports, setHighlightMissingReports] = useState(false);
  const [cableStateFilter, setCableStateFilter] = useState<LayoutCableTestState | null>(null);
  const [statusFilter, setStatusFilter] = useState<LayoutStatus | null>(null);
  const [manifest, setManifest] = useState<LayoutPlanManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [floorId, setFloorId] = useState("");
  const [combinedFloors, setCombinedFloors] = useState(true);
  const combined = isometric && combinedFloors;
  const [overrides, setOverrides] = useState(readLayoutOverrides);
  const [storageError, setStorageError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unplacedEquipment, setUnplacedEquipment] = useState<Equipment | null>(null);
  const netaReportManifest = useNetaReportManifest(Boolean(selectedId || selectedCableId || unplacedEquipment));
  const [search, setSearch] = useState("");
  const searchResource = useDashboardResources(["equipment"], Boolean(search.trim()));
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [viewport, setViewport, queueViewport, flushViewport] = useFrameState<PowerPlanRect | null>(null);
  const [panCullViewport, setPanCullViewport] = useState<PowerPlanRect | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionKeys, setSelectionKeys] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<PowerPlanRect | null>(null);
  const [inspection, setInspection] = useState<{ annotationId: string; left: number; top: number } | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panLayerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanState | null>(null);
  const panCullOffsetRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchJson<LayoutPlanManifest>("/data/layout_plan.json").then((result) => {
      if (!active) return;
      setManifest(result);
      setFloorId(result?.floors[0]?.floor_id ?? "");
      setSelectedId(null); setSelectedCableId(null); setUnplacedEquipment(null);
      setSelectionKeys(new Set());
      clearHighlights();
      setViewport(null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [retry, refreshKey]);

  useEffect(() => {
    const element = mapRef.current;
    if (loading || !element) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setMapSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);

  const combinedScene = useMemo(() => manifest && hasIsometric ? buildCombinedLayoutScene(manifest) : null, [manifest, hasIsometric]);
  const rows = useMemo(() => {
    if (combined && combinedScene) return combinedScene.rows;
    const records = manifest ? visibleLayoutEquipment(manifest, floorId) : [];
    return isometric ? isometricLayoutEquipment(records) : records;
  }, [manifest, floorId, combined, combinedScene, isometric]);
  const regions = useMemo(() => combined && combinedScene ? combinedScene.regions : manifest ? visibleLayoutRegions(manifest, floorId) : [], [manifest, floorId, combined, combinedScene]);
  const connections = useMemo(() => combined && combinedScene ? combinedScene.connections
    : isometric && combinedScene ? combinedScene.singleFloorConnections.get(floorId) ?? []
      : placedLayoutCables(manifest?.cables ?? [], rows, regions), [manifest, rows, regions, combined, combinedScene, isometric, floorId]);
  const selectedConnection = selectedCableId ? connections.find(({ cable }) => cable.cable_id === selectedCableId) : undefined;
  const missingReportConnections = useMemo(() => connections.filter(({ cable }) => layoutCableMissingReport(cable)), [connections]);
  const cableStateCounts = useMemo(() => connections.reduce<Record<LayoutCableTestState, number>>((counts, { cable }) => {
    counts[layoutCableTestState(cable)] += 1; return counts;
  }, { updated: 0, pending: 0, failed: 0, unconfirmed: 0 }), [connections]);
  // Legend-driven highlight: "missing report" or one test state, never both.
  const cableHighlightMode = highlightMissingReports || cableStateFilter !== null;
  const highlightConnections = useMemo(() => highlightMissingReports ? missingReportConnections
    : cableStateFilter ? connections.filter(({ cable }) => layoutCableTestState(cable) === cableStateFilter) : [],
  [highlightMissingReports, cableStateFilter, missingReportConnections, connections]);
  const missingReportCableIds = useMemo(() => new Set(highlightConnections.map(({ cable }) => cable.cable_id)), [highlightConnections]);
  const missingReportEndpointKeys = useMemo(() => new Set(highlightConnections.flatMap(({ cable }) =>
    [cable.source_equipment_key, cable.target_equipment_key])), [highlightConnections]);
  const cableGeometry = useMemo(() => !isometric ? [] : combined && combinedScene ? combinedScene.geometry
    : layoutCableGeometry(connections), [connections, combined, combinedScene, isometric]);
  const connectionIds = useMemo(() => new Set(connections.map((item) => item.cable.cable_id)), [connections]);
  const cableIndex = useMemo(() => {
    const byId = new Map<string, LayoutCableRecord>(), byEquipment = new Map<string, LayoutCableRecord[]>();
    for (const cable of manifest?.cables ?? []) {
      byId.set(cable.cable_id, cable);
      for (const key of new Set([cable.source_equipment_key, cable.target_equipment_key])) {
        if (key) { const items = byEquipment.get(key) ?? []; items.push(cable); byEquipment.set(key, items); }
      }
    }
    return { byId, byEquipment };
  }, [manifest]);
  const selectedCable = selectedCableId ? cableIndex.byId.get(selectedCableId) : undefined;
  const selectedCableReports = useMemo(() => selectedCable
    ? getLayoutCableReportNames(selectedCable, netaReportManifest) : [], [selectedCable, netaReportManifest]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) =>
    a.rect.x + a.rect.y + a.rect.width + a.rect.height - b.rect.x - b.rect.y - b.rect.width - b.rect.height), [rows]);
  const projectedRows = useMemo(() => sortedRows.map((row) => ({
    row, extent: projectedLayoutBounds(row.rect, layoutDeviceHeight(row) + 4),
  })), [sortedRows]);
  const selectionRows = useMemo(() => isometric ? rows.map((row) => ({ ...row,
    rect: projectedLayoutBounds(insetEquipmentRect(row.rect), layoutDeviceHeight(row)),
  })) : rows, [rows, isometric]);
  const roomLabels = useMemo(() => layoutRoomLabels(regions), [regions]);
  // One coordinate frame for every floor keeps fixed devices in the same screen positions.
  const allBounds = useMemo(() => {
    if (!manifest) return { plan: layoutBounds([]), isometric: layoutBounds([]) };
    const allRecords = manifest.floors.flatMap((floor) => visibleLayoutEquipment(manifest, floor.floor_id));
    const allRegions = manifest.floors.flatMap((floor) => visibleLayoutRegions(manifest, floor.floor_id));
    const labels = layoutRoomLabels(allRegions);
    const records = [...allRecords, ...allRegions, ...labels];
    const cableBounds = manifest.floors.flatMap((floor) => {
      const floorRegions = visibleLayoutRegions(manifest, floor.floor_id);
      const floorConnections = combinedScene?.singleFloorConnections.get(floor.floor_id)
        ?? placedLayoutCables(manifest.cables ?? [], isometricLayoutEquipment(visibleLayoutEquipment(manifest, floor.floor_id)), floorRegions);
      const lanes = layoutCableLanes(floorConnections);
      return floorConnections.map((connection, index) => ({ rect: layoutConnectionBounds(connection, lanes[index]) }));
    });
    const roomCallouts = allRegions.filter((region) => region.kind === "room").map(projectedLayoutRoomLabel);
    const ground = { rect: projectedLayoutBounds(layoutFloorFootprint(manifest), -3) };
    const isometricRecords = [...isometricLayoutEquipment(allRecords), ...allRegions, ...labels];
    return { plan: layoutBounds(records), isometric: layoutBounds([...isometricRecords.map((record) => ({ rect: projectedLayoutBounds(record.rect, 32) })), ground, ...roomCallouts, ...cableBounds]) };
  }, [manifest, combinedScene]);
  const fullBounds = combined && combinedScene ? combinedScene.bounds : isometric ? allBounds.isometric : allBounds.plan;
  const bounds = viewport ?? fullBounds;
  const overscan = 0.4;
  const cullCenter = panCullViewport ?? bounds;
  const renderBounds = { x: cullCenter.x - cullCenter.width * overscan, y: cullCenter.y - cullCenter.height * overscan,
    width: cullCenter.width * (1 + overscan * 2), height: cullCenter.height * (1 + overscan * 2) };
  const svgBounds = isometric ? { x: bounds.x - bounds.width * overscan, y: bounds.y - bounds.height * overscan,
    width: bounds.width * (1 + overscan * 2), height: bounds.height * (1 + overscan * 2) } : bounds;
  const drawnRows = isometric ? projectedRows.filter(({ extent }) => overlapsViewport(extent, renderBounds)).map(({ row }) => row) : rows;
  const drawnCables = isometric ? cableGeometry.filter(({ extent }) => overlapsViewport(extent, renderBounds)) : [];
  const pixelsPerUnit = mapSize.width && mapSize.height
    ? Math.min(mapSize.width / bounds.width, mapSize.height / bounds.height)
    : Number.POSITIVE_INFINITY;
  const detailThreshold = drawnRows.length > 400 ? Number.POSITIVE_INFINITY : 24;
  const compact = drawnRows.length > 400;
  useLayoutEffect(() => {
    if (!panRef.current && panLayerRef.current) {
      panLayerRef.current.style.transform = "";
      panLayerRef.current.style.willChange = "";
    }
  }, [viewport]);
  const zoom = fullBounds.width / bounds.width;
  const selected = selectionMode ? undefined : rows.find((row) => row.annotation_id === selectedId && selectionKeys.has(row.equipment_key))
    ?? rows.find((row) => selectionKeys.has(row.equipment_key));
  const selectedEquipmentReports = useMemo(() => getNetaReportNames(selected?.neta_test_report), [selected]);
  const selectedConnections = useMemo(() => selected ? cableIndex.byEquipment.get(selected.equipment_key) ?? [] : [], [selected, cableIndex]);
  const selectedCableCounts = useMemo(() => selectedConnections.reduce((counts, cable) => {
    const state = layoutCableTestState(cable);
    if (state === "updated" || state === "pending") counts.tested += 1;
    else if (state === "failed") counts.failed += 1;
    else counts.unconfirmed += 1;
    return counts;
  }, { tested: 0, failed: 0, unconfirmed: 0 }), [selectedConnections]);
  const focusConnections = useMemo(() => [...new Map([...selectionKeys].flatMap((key) => cableIndex.byEquipment.get(key) ?? [])
    .map((cable) => [cable.cable_id, cable])).values()], [selectionKeys, cableIndex]);
  const focusedCableIds = useMemo(() => new Set(focusConnections.map((cable) => cable.cable_id)), [focusConnections]);
  const connectedKeys = useMemo(() => new Set([...selectionKeys, ...focusConnections.flatMap((cable) =>
    [cable.source_equipment_key, cable.target_equipment_key])]), [selectionKeys, focusConnections]);
  const cableEndpointKeys = selectedCable ? [selectedCable.source_equipment_key, selectedCable.target_equipment_key] : [];
  const rowIsDimmed = (row: LayoutEquipmentRecord) => statusFilter ? statusOf(row) !== statusFilter
    : isometric && cableHighlightMode ? !missingReportEndpointKeys.has(row.equipment_key)
    : isometric && selectedCable ? !cableEndpointKeys.includes(row.equipment_key)
    : selectionKeys.size ? !connectedKeys.has(row.equipment_key)
    : !!query && !row.equipment_key.includes(query);
  const inspected = rows.find((row) => row.annotation_id === inspection?.annotationId);
  const query = search.trim().toUpperCase().replace(/^IAD06-/, "");
  const statusOf = (row: LayoutEquipmentRecord) => layoutEquipmentStatus(row, overrides);
  const selectedRows = useMemo(() => [...new Map(rows.filter((row) => selectionKeys.has(row.equipment_key)).map((row) => [row.equipment_key, row])).values()], [rows, selectionKeys]);
  const eligibleRows = selectedRows.filter((row) => statusOf(row) !== "energized" && statusOf(row) !== "energizeToday");
  const cableDiagnosticCounts = useMemo(() => (manifest?.cable_diagnostics ?? []).reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1; return counts;
  }, {}), [manifest]);

  const searchEntries = useMemo(() => manifest ? buildLayoutSearchEntries(manifest, equipment, combined ? ALL_LAYOUT_FLOORS : floorId) : [], [manifest, equipment, floorId, combined]);
  const suggestions = useMemo(() => searchLayoutEntries(searchEntries, search), [searchEntries, search]);

  function canvasRect(): DOMRect | undefined {
    const map = mapRef.current?.getBoundingClientRect();
    return map?.width && map.height ? map : svgRef.current?.getBoundingClientRect();
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || loading) return;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      if (!event.deltaY || panRef.current) return;
      setInspection(null);
      const canvas = canvasRect() ?? svg!.getBoundingClientRect();
      const factor = wheelZoomFactor(event, canvas.height);
      queueViewport((current) => {
        const view = current ?? fullBounds;
        return zoomLayoutViewport(view, fullBounds, factor,
          layoutCanvasPoint(view, canvas, event.clientX, event.clientY));
      });
    }
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [fullBounds, loading, queueViewport]);

  function saveOverrides(next: Record<string, LayoutStatus>) {
    setOverrides(next);
    try {
      if (Object.keys(next).length) localStorage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify(next));
      else localStorage.removeItem(LAYOUT_OVERRIDES_KEY);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  function focusDevice(record: LayoutEquipmentRecord) {
    setUnplacedEquipment(null);
    setInspection(null);
    setSelectedId(record.annotation_id);
    setSelectedCableId(null);
    setViewport(layoutBounds([{ rect: isometric ? projectedLayoutBounds(record.rect, layoutDeviceHeight(record) + 25) : record.rect }]));
    setSelectionKeys((current) => new Set([...current, record.equipment_key]));
    setSelectionMode(false);
  }

  function confirmSuggestion(suggestion: LayoutSearchEntry) {
    clearHighlights();
    if (suggestion.floorId === ALL_LAYOUT_FLOORS) {
      if (isometric) setCombinedFloors(true);
    } else if (suggestion.floorId && !combined) setFloorId(suggestion.floorId);
    setSearch(suggestion.label);
    setSearchOpen(false);
    setInspection(null);
    setUnplacedEquipment(null);
    setSelectedId(null);
    setSelectedCableId(null);
    if (suggestion.kind !== "placement" || (!combined && suggestion.floorId !== floorId)) setSelectionKeys(new Set());
    setSelectionMode(false);
    if (suggestion.kind === "equipment") { setUnplacedEquipment(suggestion.record); return; }
    if (suggestion.kind === "cable") {
      setSelectedCableId(suggestion.record.cable_id);
      return;
    }
    if (!isometric) { focusDevice(suggestion.record); return; }
    setSelectionKeys((current) => new Set([...current, suggestion.record.equipment_key]));
    setSelectedId(suggestion.record.annotation_id);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const mode = selectionMode && event.button === 0 ? "select" : "pan";
    event.preventDefault();
    setInspection(null);
    event.currentTarget.focus?.({ preventScroll: true });
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, viewport: bounds, moved: false,
      annotationId: (event.target as Element).closest("[data-annotation-id][role=button]")?.getAttribute("data-annotation-id") ?? null,
      cableId: (event.target as Element).closest("[data-cable-id][role=button]")?.getAttribute("data-cable-id") ?? null,
      mode, additive: event.shiftKey,
    };
    panCullOffsetRef.current = { x: 0, y: 0 };
    if (isometric && mode === "pan" && panLayerRef.current) {
      panLayerRef.current.style.willChange = "transform";
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    const canvas = canvasRect();
    if (!pan || pan.pointerId !== event.pointerId || !canvas) return;
    if (!pan.moved && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) < 4) return;
    pan.moved = true;
    if (pan.mode === "select") {
      setSelectionBox(layoutSelectionRect(
        layoutCanvasPoint(pan.viewport, canvas, pan.x, pan.y),
        layoutCanvasPoint(pan.viewport, canvas, event.clientX, event.clientY),
      ));
      return;
    }
    if (isometric && panLayerRef.current) {
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      panLayerRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      if (Math.abs(dx - panCullOffsetRef.current.x) > canvas.width * (overscan - 0.05) ||
        Math.abs(dy - panCullOffsetRef.current.y) > canvas.height * (overscan - 0.05)) {
        const scale = Math.max(Number.EPSILON, Math.min(canvas.width / pan.viewport.width, canvas.height / pan.viewport.height));
        setPanCullViewport({ ...pan.viewport, x: pan.viewport.x - dx / scale, y: pan.viewport.y - dy / scale });
        panCullOffsetRef.current = { x: dx, y: dy };
      }
      return;
    }
    const scale = Math.max(Number.EPSILON, Math.min(canvas.width / pan.viewport.width, canvas.height / pan.viewport.height));
    queueViewport({ ...pan.viewport, x: pan.viewport.x - (event.clientX - pan.x) / scale, y: pan.viewport.y - (event.clientY - pan.y) / scale });
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (isometric && pan.mode === "pan" && pan.moved) {
      const canvas = canvasRect() ?? event.currentTarget.getBoundingClientRect();
      const scale = Math.max(Number.EPSILON, Math.min(canvas.width / pan.viewport.width, canvas.height / pan.viewport.height));
      setViewport({ ...pan.viewport, x: pan.viewport.x - (event.clientX - pan.x) / scale,
        y: pan.viewport.y - (event.clientY - pan.y) / scale });
    } else flushViewport();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
    setPanCullViewport(null);
    suppressClickRef.current = pan.moved || cancelled || pan.mode === "select";
    setSelectionBox(null);
    if (cancelled) return;
    if (pan.mode === "select") {
      const canvas = canvasRect() ?? event.currentTarget.getBoundingClientRect();
      if (pan.moved) {
        const found = equipmentInLayoutSelection(selectionRows, layoutSelectionRect(
          layoutCanvasPoint(pan.viewport, canvas, pan.x, pan.y),
          layoutCanvasPoint(pan.viewport, canvas, event.clientX, event.clientY),
        ), !isometric);
        setSelectionKeys((current) => pan.additive ? new Set([...current, ...found]) : found);
      } else if (pan.annotationId) {
        const record = rows.find((row) => row.annotation_id === pan.annotationId);
        if (record) toggleEquipmentSelection(record.equipment_key);
      } else if (!pan.additive) setSelectionKeys(new Set());
    } else if (!pan.moved && pan.button === 0) {
      if (pan.annotationId) {
        const record = rows.find((row) => row.annotation_id === pan.annotationId);
        if (record) selectDevice(record);
        suppressClickRef.current = true;
      } else if (pan.cableId) {
        selectCable(pan.cableId);
        suppressClickRef.current = true;
      } else clearFocus();
    }
  }

  const toggleEquipmentSelection = useCallback((key: string) => {
    setSelectionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectDevice = useCallback((record: LayoutEquipmentRecord) => {
    toggleEquipmentSelection(record.equipment_key);
    clearHighlights(); setSearch(""); setSearchOpen(false);
    setSelectedId(record.annotation_id); setSelectedCableId(null); setUnplacedEquipment(null);
  }, [toggleEquipmentSelection]);
  const selectCable = useCallback((cableId: string) => {
    setSelectedCableId(cableId); setSelectedId(null); setUnplacedEquipment(null);
    setSelectionKeys(new Set()); setSearch(""); setSearchOpen(false);
  }, []);
  const leaveDevice = useCallback((annotationId: string) => {
    setInspection((current) => current?.annotationId === annotationId ? null : current);
  }, []);

  function cancelSelectionGesture() {
    const pan = panRef.current;
    if (pan?.mode === "select") {
      if (svgRef.current?.hasPointerCapture?.(pan.pointerId)) svgRef.current.releasePointerCapture(pan.pointerId);
      panRef.current = null;
      suppressClickRef.current = true;
      setSelectionBox(null);
    } else setSelectionKeys(new Set());
  }

  const inspectDevice = useCallback((record: LayoutEquipmentRecord, element: SVGGElement) => {
    const map = mapRef.current?.getBoundingClientRect();
    if (!map || panRef.current) return;
    const device = element.getBoundingClientRect();
    const left = Math.max(12, Math.min(device.right - map.left + 12, map.width - 300));
    const preferredTop = device.top - map.top - 124;
    const top = Math.max(12, Math.min(preferredTop >= 12 ? preferredTop : device.bottom - map.top + 12, map.height - 152));
    setInspection({ annotationId: record.annotation_id, left, top });
  }, []);

  function switchView(next: boolean) {
    if (next) setHasIsometric(true);
    const nextKeys = next && combinedFloors ? null : new Set((manifest ? visibleLayoutEquipment(manifest, floorId) : []).map((row) => row.equipment_key));
    setSelectionKeys((current) => selectionMode ? new Set() : new Set([...current].filter((key) => !nextKeys || nextKeys.has(key))));
    setIsometric(next); clearHighlights(); setViewport(null); setInspection(null); setSelectionBox(null);
    panRef.current = null;
    setPanCullViewport(null);
    if (panLayerRef.current) { panLayerRef.current.style.transform = ""; panLayerRef.current.style.willChange = ""; }
    try { localStorage.setItem(LAYOUT_VIEW_KEY, next ? "isometric" : "plan"); } catch { /* View works without persistence. */ }
  }

  function clearHighlights() {
    setHighlightMissingReports(false); setCableStateFilter(null); setStatusFilter(null);
  }

  function toggleCableHighlight(next: "missing" | LayoutCableTestState) {
    const active = next === "missing" ? highlightMissingReports : cableStateFilter === next;
    clearFocus();
    if (active) return;
    if (next === "missing") setHighlightMissingReports(true); else setCableStateFilter(next);
    setShowCables(true); setSelectionMode(false); setSelectionBox(null);
  }

  function toggleStatusHighlight(status: LayoutStatus) {
    const active = statusFilter === status;
    clearFocus();
    if (!active) { setStatusFilter(status); setSelectionMode(false); setSelectionBox(null); }
  }

  function clearFocus() {
    clearHighlights();
    setSelectedId(null); setSelectedCableId(null); setUnplacedEquipment(null); setInspection(null); setSearch(""); setSearchOpen(false);
    setSelectionKeys(new Set());
  }

  function restoreGlobalView() {
    clearFocus(); setViewport(null); setSelectionMode(false); setSelectionBox(null);
    panRef.current = null;
  }

  function focusCable(cableId: string) {
    setSelectedCableId(cableId); setInspection(null); setSelectionMode(false); setSearch(""); setSearchOpen(false);
    const connection = connections.find((item) => item.cable.cable_id === cableId);
    if (connection) setViewport(isometric ? layoutBounds([{ rect: cableGeometry.find(({ connection: item }) => item.cable.cable_id === cableId)?.extent
      ?? layoutConnectionBounds(connection) }])
      : layoutBounds([connection.source, connection.target]));
  }

  if (loading) return <LoadingState />;
  if (!manifest) return <ErrorState message="Layout data could not be loaded. Run the Layout ETL builder and retry." onRetry={() => setRetry((value) => value + 1)} />;
  if (!manifest.floors.length) return <EmptyState title="No layout floors available" description="No configured floor drawing is available. Refresh the layout data after adding it." />;

  const equipmentFloorLabel = (row: LayoutEquipmentRecord) => row.fixed ? "Shared Outdoor Equipment"
    : manifest.floors.find((floor) => floor.floor_id === row.source_floor_id)?.label ?? "Floor equipment";
  const isCableActive = (cable: LayoutCableRecord) => selectedCableId ? selectedCableId === cable.cable_id : focusedCableIds.has(cable.cable_id);
  const isCableHighlighted = (cable: LayoutCableRecord) => cableHighlightMode ? missingReportCableIds.has(cable.cable_id) : isCableActive(cable);
  const undergroundCables = drawnCables.filter(({ route }) => route === "underground");
  const aboveGroundCables = drawnCables.filter(({ route }) => route !== "underground");
  const backgroundFeeds = aboveGroundCables.filter(({ connection }) => connection.externalKind === "shared-feed" &&
    !isCableHighlighted(connection.cable));
  const backgroundFeedIds = new Set(backgroundFeeds.map(({ connection }) => connection.cable.cable_id));
  const foregroundCables = aboveGroundCables.filter(({ connection }) => !backgroundFeedIds.has(connection.cable.cable_id));
  const ordinaryCables = foregroundCables.filter(({ connection }) => !isCableHighlighted(connection.cable));
  const highlightedCables = foregroundCables.filter(({ connection }) => isCableHighlighted(connection.cable));
  const groundPlates = combined && combinedScene ? combinedScene.groups.flatMap((group, index) => group.groundRect
    ? [{ id: group.id, rect: group.groundRect, raised: index > 0 }] : [])
    : combinedScene ? [{ id: floorId, rect: combinedScene.floorFootprint, raised: floorId !== manifest.floors[0].floor_id }] : [];
  const renderCable = ({ connection, path, markerPoint, route, zone }: (typeof cableGeometry)[number]) => {
    const cable = connection.cable;
    const active = cableHighlightMode ? missingReportCableIds.has(cable.cable_id) : isCableActive(cable);
    const dimmed = cableHighlightMode ? !active : selectedCableId || selectionKeys.size ? !active : (!!query &&
      ![cable.cable_id, cable.source_equipment_key ?? "", cable.target_equipment_key ?? ""].some((key) => key.toUpperCase().includes(query)));
    return <LayoutCable key={cable.cable_id} cable={cable} path={path} route={route} zone={zone} selected={selectedCableId === cable.cable_id}
      markerPoint={markerPoint} markerSize={Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0 ? 15 / pixelsPerUnit : 7}
      externalKind={connection.externalKind} hubEquipmentKey={connection.externalRoute?.hubEquipmentKey}
      active={active} dimmed={dimmed} selectionMode={selectionMode} onSelect={selectCable} />;
  };

  const cableDetails = selectedCable ? <div key={selectedCable.cable_id} className="space-y-3" aria-label="Cable details">
    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">Cable connection</h3>
      <Button variant="ghost" aria-label="Close cable details" onClick={() => setSelectedCableId(null)}><X className="h-4 w-4" /></Button></div>
    <p className="break-all text-sm font-medium">{selectedCable.cable_id}</p>
    <EquipmentExternalLinks equipmentId={selectedCable.cable_id} />
    <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
      <p className="break-all">From: {selectedCable.source_equipment_key ?? "Unresolved"}
        {selectedConnection ? <span className="block text-xs text-muted-foreground">{equipmentFloorLabel(selectedConnection.source)}</span> : null}</p>
      <p className="break-all">To: {selectedCable.target_equipment_key ?? "Unresolved"}
        {selectedConnection ? <span className="block text-xs text-muted-foreground">{equipmentFloorLabel(selectedConnection.target)}</span> : null}</p>
    </div>
    {selectedCable.connection_source === "mv_diagram" ? <p className="text-xs text-muted-foreground">Connection mapped from MV Equipment diagram.</p> : null}
    <p className="text-sm font-medium" style={{ color: LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selectedCable)].color }}>{LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selectedCable)].label}</p>
    {layoutCableMissingReport(selectedCable) ? <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{LAYOUT_CABLE_MISSING_REPORT_MESSAGE}
    </p> : null}
    <p className="text-xs">Type: {selectedCable.equipment_type}</p>
    <p className="text-xs">Infralink: {selectedCable.system_element_status ?? "Unknown"}</p>
    <EquipmentUpdateInfo updated_by={selectedCable.updated_by} updated_at={selectedCable.updated_at} />
    <p className="text-xs">EPS daily: {selectedCable.eps_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selectedCable.eps_daily_test_date ? ` · ${selectedCable.eps_daily_test_date}` : ""}{selectedCable.eps_daily_report_name ? ` · ${selectedCable.eps_daily_report_name}` : ""}</p>
    <p className="text-xs">MV daily: {selectedCable.mv_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selectedCable.mv_daily_test_date ? ` · ${selectedCable.mv_daily_test_date}` : ""}</p>
    <DailyTestHistory events={selectedCable.daily_report_history} conflict={selectedCable.daily_report_conflict} />
    <p className="text-xs">NETA: {selectedCable.neta_complete ? "Complete" : "Not confirmed"}</p>
    <FeederCableAtpReports key={selectedCable.cable_id} files={selectedCable.feeder_cable_atp_files ?? []}
      names={selectedCable.feeder_cable_atp_names ?? []} required={selectedCable.feeder_cable_atp_required ?? false} />
    {selectedCableReports.length ? <section className="space-y-2" aria-label="Cable test reports">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">Cable NETA reports</h4>
      <div className="max-h-48 overflow-y-auto pr-1 [scrollbar-gutter:stable]" role="region" aria-label="Cable NETA report list" tabIndex={0}>
        <NetaReportChips equipmentId={selectedCable.cable_id} reports={selectedCableReports} showLinkedFileNames stackedCompact />
        <NetaDuplicatePanel key={selectedCable.cable_id} equipmentId={selectedCable.cable_id} />
      </div>
    </section> : null}
    {selectedCable.neta_complete && !selectedCable.neta_test_report ? <p className="text-xs text-red-700">Data quality: NETA complete but report is missing.</p> : null}
    {!connectionIds.has(selectedCable.cable_id) ? <p className="text-xs text-amber-700">Connection is not drawn: {selectedCable.connection_status === "resolved" ? "endpoint is on another floor or has multiple placements" : selectedCable.connection_status.replace(/_/g, " ")}.</p> : null}
    <Button variant="outline" disabled={!connectionIds.has(selectedCable.cable_id)} onClick={() => focusCable(selectedCable.cable_id)}>Zoom to connection</Button>
  </div> : null;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Layout</h2>
        <p className="mt-1 text-sm text-muted-foreground">{rows.length} rectangles · {new Set(rows.map((row) => row.equipment_key)).size} equipment IDs · {rows.filter((row) => row.fixed).length} fixed across floors · {rows.filter((row) => row.match_status !== "matched").length} unmatched / ambiguous</p></div>
      <Button variant="outline" onClick={() => saveOverrides({})} disabled={!Object.keys(overrides).length}>
        <RotateCcw className="mr-2 h-4 w-4" />Reset all statuses
      </Button>
    </div>
    <div className="relative z-20 space-y-3 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Layout view">
        <Button variant={!isometric ? "secondary" : "ghost"} aria-pressed={!isometric} onClick={() => switchView(false)}>2D plan</Button>
        <Button variant={isometric ? "secondary" : "ghost"} aria-pressed={isometric} onClick={() => switchView(true)}><Box className="mr-2 h-4 w-4" />2.5D</Button>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">Floor
        <select aria-label="Floor" value={combined ? ALL_LAYOUT_FLOORS : floorId} onChange={(event) => {
          setCombinedFloors(event.target.value === ALL_LAYOUT_FLOORS);
          if (event.target.value !== ALL_LAYOUT_FLOORS) setFloorId(event.target.value);
          setViewport(null); setSelectedId(null); setSelectedCableId(null); setUnplacedEquipment(null); setSearchOpen(false); setInspection(null); setSelectionKeys(new Set());
          clearHighlights();
        }} className="block h-9 rounded-md border bg-background px-3">
          {isometric ? <option value={ALL_LAYOUT_FLOORS}>All floors</option> : null}
          {manifest.floors.map((floor) => <option key={floor.floor_id} value={floor.floor_id}>{floor.label}</option>)}
        </select>
      </label>
      <Button variant="outline" aria-label="Zoom out" onClick={() => { setInspection(null); setViewport(zoomLayoutViewport(bounds, fullBounds, 1.2)); }}><ZoomOut className="h-4 w-4" /></Button>
      <span className="text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button variant="outline" aria-label="Zoom in" onClick={() => { setInspection(null); setViewport(zoomLayoutViewport(bounds, fullBounds, 0.82)); }}><ZoomIn className="h-4 w-4" /></Button>
      <Button variant="outline" onClick={restoreGlobalView}><Maximize className="mr-2 h-4 w-4" />{isometric ? "Global view" : "Fit layout"}</Button>
      <span className="mx-1 h-8 border-l" aria-hidden="true" />
      <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Map tool">
        <Button variant={!selectionMode ? "secondary" : "ghost"} aria-pressed={!selectionMode} onClick={() => {
          setSelectionMode(false); setSelectionBox(null); setInspection(null);
        }}><Hand className="mr-2 h-4 w-4" />Pan</Button>
        <Button variant={selectionMode ? "secondary" : "ghost"} aria-pressed={selectionMode} onClick={() => {
          clearHighlights();
          setSelectionMode((current) => !current); setSelectedCableId(null); setSelectionBox(null); setInspection(null);
        }}><MousePointer2 className="mr-2 h-4 w-4" />Box select</Button>
      </div>
      <span role="status" className="text-sm text-muted-foreground">{selectedRows.length} selected{selectionMode ? ` · ${eligibleRows.length} eligible` : ""}</span>
      {selectionMode ? <Button disabled={!eligibleRows.length} onClick={() => saveOverrides(planLayoutSelection(rows, selectionKeys, overrides))}>
        <Zap className="mr-2 h-4 w-4 text-orange-500" />Energize today ({eligibleRows.length})
      </Button> : null}
      <Button variant="ghost" disabled={!selectionKeys.size} onClick={() => { setSelectionKeys(new Set()); setSelectedId(null); setSelectedCableId(null); setSearch(""); }}><X className="mr-2 h-4 w-4" />Clear selection</Button>
    </div>
    <div className="space-y-2 border-t pt-3">
    {isometric ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <Button variant={showCables ? "outline" : "secondary"} aria-pressed={showCables} aria-controls="layout-cables layout-shared-feed-cables layout-underground-cables"
        title={showCables ? "Click to hide all cables" : "Click to show all cables"} className={showCables ? undefined : "text-muted-foreground"} onClick={() => {
          setShowCables((value) => !value); setSelectedCableId(null); clearHighlights();
        }}>
        {showCables ? <Cable className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}Cable connections ({connections.length})
      </Button>
      {(Object.entries(LAYOUT_CABLE_TEST_STATES) as [LayoutCableTestState, (typeof LAYOUT_CABLE_TEST_STATES)[LayoutCableTestState]][]).map(([key, state]) =>
        <LegendToggle key={key} pressed={cableStateFilter === key} count={cableStateCounts[key]} accent={state.color}
          disabled={!cableStateCounts[key] && cableStateFilter !== key} controls="layout-cables layout-shared-feed-cables layout-underground-cables"
          title={`Highlight ${state.label} cables on this floor.`} onClick={() => toggleCableHighlight(key)}>
          <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={state.color} strokeWidth="2.5" strokeDasharray={state.dash} /></svg>{state.label}
        </LegendToggle>)}
      <LegendToggle pressed={highlightMissingReports} count={missingReportConnections.length} accent="#b45309" tone="text-amber-800"
        disabled={!missingReportConnections.length && !highlightMissingReports} controls="layout-cables layout-shared-feed-cables layout-underground-cables"
        title={LAYOUT_CABLE_MISSING_REPORT_MESSAGE} onClick={() => toggleCableHighlight("missing")}>
        <CircleAlert className="h-4 w-4 fill-amber-100" aria-hidden="true" />Infralink updated · Report missing
      </LegendToggle>
      <Button variant="ghost" className={selectionKeys.size || selectedCable || unplacedEquipment || cableHighlightMode || statusFilter ? undefined : "invisible"}
        disabled={!selectionKeys.size && !selectedCable && !unplacedEquipment && !cableHighlightMode && !statusFilter} onClick={clearFocus}><X className="mr-2 h-4 w-4" />Clear focus</Button>
      {!manifest.cables ? <span className="text-amber-700">Cable data is unavailable. Rebuild Layout data to load connections.</span> : null}
    </div> : null}
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {(Object.keys(LAYOUT_STATUS_LABELS) as LayoutStatus[]).map((status) => {
        const count = rows.filter((row) => statusOf(row) === status).length;
        return <LegendToggle key={status} pressed={statusFilter === status} accent={LAYOUT_STATUS_COLORS[status].stroke}
          disabled={!count && statusFilter !== status} title={`Highlight ${LAYOUT_STATUS_LABELS[status]} equipment.`} onClick={() => toggleStatusHighlight(status)}>
          {status === "energized" || status === "energizeToday" ? <Zap className="h-4 w-4" color={LAYOUT_STATUS_COLORS[status].stroke} fill={LAYOUT_STATUS_COLORS[status].stroke} />
            : <span className="h-3 w-3 rounded border" style={{ backgroundColor: LAYOUT_STATUS_COLORS[status].fill, borderColor: LAYOUT_STATUS_COLORS[status].stroke }} />}
          {LAYOUT_STATUS_LABELS[status]} ({count})
        </LegendToggle>;
      })}
      {isometric ? <span className="ml-3 flex items-center gap-1.5 text-xs font-semibold text-amber-950">
        <Zap className="h-4 w-4 shrink-0 fill-red-700 text-red-700" aria-hidden="true" />
        Breathing lightning: energized or energizing today
      </span> : null}
    </div>
    </div>
    </div>
    {storageError ? <p role="alert" className="text-sm text-amber-700">Browser storage is unavailable. Changes apply for this visit only.</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div ref={mapRef} className="relative h-[68vh] min-h-[400px] overflow-hidden rounded-lg border bg-white" aria-label="Layout map">
        <div ref={panLayerRef} data-layout-pan="true" className="relative h-full w-full">
        <svg ref={svgRef} role="img" tabIndex={0} aria-label={`${combined ? "All floors" : manifest.floors.find((floor) => floor.floor_id === floorId)?.label} equipment layout`}
          viewBox={`${svgBounds.x} ${svgBounds.y} ${svgBounds.width} ${svgBounds.height}`} preserveAspectRatio="xMidYMid meet"
          className={`${isometric ? "absolute -left-[40%] -top-[40%] h-[180%] w-[180%]" : "h-full w-full"} select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selectionMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`} style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={(event) => endPan(event)} onPointerCancel={(event) => endPan(event, true)}
          onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}
          onKeyDown={(event) => { if (event.key === "Escape") {
            if (isometric && !selectionMode) restoreGlobalView(); else { setInspection(null); cancelSelectionGesture(); }
          } }}
          onClickCapture={(event) => { if (suppressClickRef.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
          {hasIsometric ? <SimpleIsometricSymbols /> : null}
          <g data-layout-scene="true">
          {isometric ? <g data-layout-layer="floor-grounds" pointerEvents="none">
            {groundPlates.map((ground) => <LayoutFloorGround key={ground.id} floorId={ground.id} rect={ground.rect} raised={ground.raised} />)}
          </g> : null}
          {combined && combinedScene ? <g data-layout-layer="floor-frames" pointerEvents="none">
            {combinedScene.groups.map((group) => <g key={group.id} data-layout-floor={group.id} data-floor-offset={group.offsetY}>
              <rect {...group.rect} fill="none" stroke="none" />
              <text x={group.labelPosition.x} y={group.labelPosition.y} fontSize={18} fontWeight={600} fill="#36566c"
                stroke="white" strokeWidth={4} paintOrder="stroke">{group.label}</text>
            </g>)}
          </g> : null}
          <LayoutBackground regions={regions} roomLabels={roomLabels} isometric={isometric} />
          {isometric && showCables ? <g id="layout-underground-cables" data-layout-layer="underground-cables">
            {undergroundCables.filter(({ connection }) => !isCableHighlighted(connection.cable)).map(renderCable)}
            {undergroundCables.filter(({ connection }) => isCableHighlighted(connection.cable)).map(renderCable)}
          </g> : null}
          {isometric && showCables ? <g id="layout-shared-feed-cables" data-layout-layer="shared-feed-cables">
            {backgroundFeeds.map(renderCable)}
          </g> : null}
          <g data-layout-layer="equipment">
            {drawnRows.map((row) => {
              const selected = selectionKeys.has(row.equipment_key) || (isometric && cableEndpointKeys.includes(row.equipment_key));
              const inspected = inspection?.annotationId === row.annotation_id;
              const projectedWidthPixels = (row.rect.width + row.rect.height) * pixelsPerUnit;
              return <EquipmentRectangle key={row.annotation_id} record={row} status={statusOf(row)} isometric={isometric} hasIsometric={hasIsometric}
                selected={selected} dimmed={rowIsDimmed(row)} tooltipVisible={inspected}
                detailed={layoutDeviceKind(row) === "generator" || (!selectionMode && selected) || inspected || projectedWidthPixels >= detailThreshold}
                showLabel={(!selectionMode && selected) || inspected || projectedWidthPixels >= 12}
                compact={compact}
                onInspect={inspectDevice} onLeave={leaveDevice} onSelect={selectDevice} />;
            })}
          </g>
          {isometric && showCables ? <g id="layout-cables" data-layout-layer="cables">
            {ordinaryCables.filter(({ connection }) => !connection.externalKind).map(renderCable)}
            {ordinaryCables.filter(({ connection }) => connection.externalKind).map(renderCable)}
            {highlightedCables.map(renderCable)}
          </g> : null}
          <g pointerEvents="none" data-layout-layer="selection">
            {selectionBox ? <rect {...selectionBox} fill="#2563eb" fillOpacity={0.12} stroke="#2563eb"
              strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" /> : null}
          </g>
          <g pointerEvents="none" data-layout-layer="lightning">
            {drawnRows.map((row) => <EquipmentLightning key={row.annotation_id} record={row} status={statusOf(row)}
              isometric={isometric} dimmed={rowIsDimmed(row)} />)}
          </g>
          </g>
        </svg>
        </div>
        <div className="absolute left-3 top-3 z-20 w-96 max-w-[calc(100%-24px)] text-sm font-medium"
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
          <label htmlFor="layout-equipment-search" className="sr-only">Find equipment</label>
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input id="layout-equipment-search" role="combobox" aria-autocomplete="list" aria-controls="layout-equipment-suggestions"
              aria-expanded={searchOpen && !!query} aria-activedescendant={searchOpen && suggestions.length ? `layout-equipment-option-${Math.min(activeSearchIndex, suggestions.length - 1)}` : undefined}
              value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => {
                setSearch(event.target.value); setSearchOpen(true); setActiveSearchIndex(0);
              }} onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault(); setSearchOpen(true);
                  setActiveSearchIndex((value) => Math.max(0, Math.min(suggestions.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
                }
                if (event.key === "Enter" && suggestions.length) {
                  event.preventDefault(); confirmSuggestion(suggestions[Math.min(activeSearchIndex, suggestions.length - 1)]);
                }
              }} placeholder="Equipment / cable ID · Enter to select"
              className="h-9 w-full rounded-md border bg-background/95 pl-9 pr-3 shadow-md backdrop-blur" />
          </div>
          {searchOpen && query ? <div id="layout-equipment-suggestions" role="listbox" aria-label="Equipment suggestions"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-card p-1 shadow-lg">
            {suggestions.length ? suggestions.map((suggestion, index) => <button type="button" role="option"
              id={`layout-equipment-option-${index}`} aria-selected={index === activeSearchIndex}
              key={suggestion.id}
              className={`flex w-full flex-col items-start gap-0.5 rounded px-3 py-1.5 text-left text-sm ${index === activeSearchIndex ? "bg-accent" : "hover:bg-accent"}`}
              onPointerDown={(event) => event.preventDefault()} onClick={() => confirmSuggestion(suggestion)}>
              <span className="w-full break-words font-medium leading-snug [overflow-wrap:anywhere]">{suggestion.label}</span>
              <span className="w-full truncate text-xs font-normal text-muted-foreground" title={suggestion.floorLabel}>{suggestion.floorLabel}</span>
            </button>) : !searchResource.loading && !searchResource.error ? <div className="px-3 py-2 text-sm text-muted-foreground">No matching equipment</div> : null}
            {searchResource.loading ? <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Loading Excel equipment IDs…</p> : null}
            {searchResource.error ? <div className="px-3 py-2 text-sm">Excel equipment IDs could not be loaded. <Button variant="ghost" onClick={searchResource.retry}>Retry search data</Button></div> : null}
          </div> : null}
        </div>
        {inspected && inspection ? <div id="layout-equipment-tooltip" role="tooltip"
          className="pointer-events-none absolute z-10 w-72 max-w-[calc(100%-24px)] rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
          style={{ left: inspection.left, top: inspection.top }}>
          <p className="break-all text-base font-semibold leading-snug">{inspected.matched_equipment_id ?? inspected.label}</p>
          <p className="mt-2 text-sm font-medium" style={{ color: LAYOUT_STATUS_COLORS[statusOf(inspected)].stroke }}>{LAYOUT_STATUS_LABELS[statusOf(inspected)]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{equipmentFloorLabel(inspected)} · Select for details</p>
        </div> : null}
      </div>
      <div className="relative h-[68vh] min-h-[400px]">
      <aside className="h-full space-y-4 overflow-y-auto overscroll-contain rounded-lg border bg-card p-4 [scrollbar-gutter:stable]">
        {!selectionMode && selectedRows.length ? <section className="space-y-2 border-b pb-3" aria-label="Selected equipment">
          <h3 className="text-sm font-semibold">Selected equipment ({selectedRows.length})</h3>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {selectedRows.map((row) => <Button key={row.equipment_key} variant="outline" className="h-auto max-w-full gap-2 px-2 py-1 text-xs"
              aria-label={`Deselect ${row.label}`} onClick={() => selectDevice(row)}>
              <span className="min-w-0 break-all">{row.label}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </Button>)}
          </div>
        </section> : null}
        {!selected && cableDetails ? <div className="border-b pb-4">{cableDetails}</div> : null}
        {unplacedEquipment ? <section aria-label="Excel equipment details" className="space-y-3">
          <h3 className="break-all font-semibold">{unplacedEquipment.equipment_id}</h3>
          <EquipmentExternalLinks equipmentId={unplacedEquipment.equipment_id} />
          <p className="text-sm text-amber-700">Not placed on layout. This Equipment ID exists in SystemElements Excel.</p>
          <p className="text-sm">Type: {unplacedEquipment.equipment_type ?? "Unknown"}</p>
          <p className="text-sm">System status: {unplacedEquipment.status ?? "Unknown"}</p>
          <EquipmentUpdateInfo updated_by={unplacedEquipment.updated_by} updated_at={unplacedEquipment.updated_at} />
          <p className="break-all text-sm">Parent: {unplacedEquipment.parent ?? "Unknown"}</p>
          <p className="text-sm">Excel energized date: {unplacedEquipment.energized_completed_at ?? "No completed date"}</p>
          <p className="text-sm">NETA: {unplacedEquipment.neta_complete === true ? "Complete" : "Not confirmed"}</p>
          {getNetaReportNames(unplacedEquipment.neta_test_report).length ? <NetaReportChips equipmentId={unplacedEquipment.equipment_id} reports={getNetaReportNames(unplacedEquipment.neta_test_report)} showLinkedFileNames stackedCompact /> : null}
          <NetaDuplicatePanel key={unplacedEquipment.equipment_id} equipmentId={unplacedEquipment.equipment_id} />
          {unplacedEquipment.neta_complete === true && !unplacedEquipment.neta_test_report ? <p className="text-xs text-red-700">Data quality: NETA complete but report is missing.</p> : null}
        </section> : null}
        {selected ? <div className="space-y-3">
          <h3 className="break-all font-semibold">{selected.matched_equipment_id ?? selected.label}</h3>
          <EquipmentExternalLinks equipmentId={selected.matched_equipment_id} matchStatus={selected.match_status} />
          {isometric && (statusOf(selected) === "energized" || statusOf(selected) === "energizeToday") ?
            <div className="rounded-md border-2 border-amber-700 bg-yellow-100 p-3 text-amber-950" aria-label="Electrical hazard warning">
              <p className="flex items-center gap-2 text-sm font-bold"><Zap className="h-5 w-5 shrink-0" aria-hidden="true" />Electrical hazard</p>
              <p className="mt-1 text-sm">{statusOf(selected) === "energized" ? "Energized equipment." : "Scheduled to energize today; confirmation pending."} Verify isolation before work.</p>
            </div> : null}
          <Button className="w-full gap-2" aria-pressed={statusOf(selected) === "energizeToday"}
            disabled={statusOf(selected) === "energized"}
            variant={statusOf(selected) === "energizeToday" ? "secondary" : "default"}
            onClick={() => {
              if (statusOf(selected) === "energized") return;
              const next = { ...overrides };
              if (next[selected.equipment_key] === "energizeToday") delete next[selected.equipment_key];
              else next[selected.equipment_key] = "energizeToday";
              saveOverrides(next);
            }}><Zap className="h-4 w-4 text-orange-500" />Energize today</Button>
          <p className="text-xs text-muted-foreground">{equipmentFloorLabel(selected)} · {selected.match_status}</p>
          {isometric ? <p className="text-xs text-muted-foreground">{DEVICE_KIND_LABELS[layoutDeviceKind(selected)]}</p> : null}
          <p className="text-sm">Excel energized date: {selected.energized_completed_at ?? "No completed date"}</p>
          <p className="text-sm">System status: {selected.system_element_status ?? "Unknown"}</p>
          <EquipmentUpdateInfo updated_by={selected.updated_by} updated_at={selected.updated_at} />
          <p className="text-sm font-medium">{LAYOUT_STATUS_LABELS[statusOf(selected)]}</p>
          {selectedEquipmentReports.length ? <section className="space-y-2" aria-label="Equipment test reports">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">NETA test reports</h4>
            <div className="h-48 overflow-y-auto pr-1 [scrollbar-gutter:stable]" role="region" aria-label="Equipment NETA report list" tabIndex={0}>
              <NetaReportChips equipmentId={selected.matched_equipment_id ?? selected.equipment_key} reports={selectedEquipmentReports} compactNameMode="gc" showLinkedFileNames stackedCompact />
              <NetaDuplicatePanel key={selected.matched_equipment_id ?? selected.equipment_key} equipmentId={selected.matched_equipment_id ?? selected.equipment_key} />
            </div>
          </section> : null}
          <DailyTestHistory events={selected.daily_report_history} />
          <p className="text-xs text-muted-foreground">{overrides[selected.equipment_key] && !selected.energized_completed_at ? "Manual override · saved in this browser" : "From SystemElements Excel"}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => focusDevice(selected)}>Zoom to device</Button>
            <Button variant="ghost" disabled={!overrides[selected.equipment_key]} onClick={() => {
              const next = { ...overrides }; delete next[selected.equipment_key]; saveOverrides(next);
            }}>Reset device</Button></div>
        </div> : !selectedCable && !unplacedEquipment ? <p className="text-sm text-muted-foreground">Select equipment or confirm a search suggestion to view its details.</p> : null}
        {isometric && selected ? <section className="space-y-2 border-t pt-3" aria-label="Connected cables">
          <h3 className="text-sm font-semibold">Connected cables ({selectedConnections.length})</h3>
          <div className="grid grid-cols-3 gap-2 text-center" aria-label="Connected cable test counts">
            <div className="rounded-md bg-green-50 px-1 py-2 text-green-700" aria-label={`Tested: ${selectedCableCounts.tested}`}>
              <span className="block text-base font-semibold tabular-nums">{selectedCableCounts.tested}</span>
              <span className="block text-[11px] leading-tight">Tested</span>
            </div>
            <div className="rounded-md bg-red-50 px-1 py-2 text-red-700" aria-label={`Test failed: ${selectedCableCounts.failed}`}>
              <span className="block text-base font-semibold tabular-nums">{selectedCableCounts.failed}</span>
              <span className="block text-[11px] leading-tight">Test failed</span>
            </div>
            <div className="rounded-md bg-slate-100 px-1 py-2 text-slate-600" aria-label={`Testing not confirmed: ${selectedCableCounts.unconfirmed}`}>
              <span className="block text-base font-semibold tabular-nums">{selectedCableCounts.unconfirmed}</span>
              <span className="block text-[11px] leading-tight">Testing not confirmed</span>
            </div>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto" aria-label="Connected cable list">
            {selectedConnections.map((cable) => {
              const state = LAYOUT_CABLE_TEST_STATES[layoutCableTestState(cable)];
              const other = cable.source_equipment_key === selected.equipment_key ? cable.target_equipment_key : cable.source_equipment_key;
              return <button key={cable.cable_id} type="button" onClick={() => { setSelectedCableId(cable.cable_id); setInspection(null); }}
                aria-pressed={selectedCableId === cable.cable_id} className={`w-full space-y-1 rounded-md border p-2 text-left hover:bg-accent ${selectedCableId === cable.cable_id ? "border-blue-500 bg-blue-50" : ""}`}>
                <span className="block break-all text-sm font-medium">↔ {other ?? "Unresolved endpoint"}</span>
                <span className="block break-all text-xs text-muted-foreground">{cable.cable_id}</span>
                <span className="block text-xs" style={{ color: state.color }}>{state.label}</span>
                {layoutCableMissingReport(cable) ? <span className="flex items-center gap-1 text-xs font-medium text-amber-800" title={LAYOUT_CABLE_MISSING_REPORT_MESSAGE}>
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Report missing
                </span> : null}
                {cable.feeder_cable_atp_files?.length ? <span className="block text-xs font-medium text-blue-700">Feeder Cable ATP PDF</span> : null}
                {!connectionIds.has(cable.cable_id) ? <span className="block text-xs text-muted-foreground">Outside this view / unresolved placement</span> : null}
              </button>;
            })}
          </div>
          {!selectedConnections.length ? <p className="text-xs text-muted-foreground">No feeder cable references this equipment ID.</p> : null}
        </section> : null}
        {isometric && !!manifest.cable_diagnostics?.length ? <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Cable placement diagnostics ({manifest.cable_diagnostics.length})</summary>
          <ul className="mt-2 space-y-1">{Object.entries(cableDiagnosticCounts).map(([reason, count]) => <li key={reason}>{reason.replace(/_/g, " ")}: {count}</li>)}</ul>
          <p className="mt-2">All cable IDs and unresolved endpoints are retained in the Layout dataset.</p>
        </details> : null}
        {manifest.diagnostics.length ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Source diagnostics ({manifest.diagnostics.length})</summary>
          <ul className="mt-2 max-h-60 space-y-1 overflow-auto">{manifest.diagnostics.map((item, index) => <li key={index}>{item.floor_id} · {item.label ?? "PDF"} · {item.reason}</li>)}</ul>
        </details> : null}
      </aside>
      {selected && cableDetails ? <div role="region" aria-label="Cable inspector"
        className="absolute inset-0 z-30 overflow-y-auto overscroll-contain rounded-lg border bg-card p-4 shadow-xl xl:bottom-auto xl:left-auto xl:right-full xl:mr-3 xl:max-h-full xl:w-96">
        {cableDetails}
      </div> : null}
      </div>
    </div>
  </div>;
}
