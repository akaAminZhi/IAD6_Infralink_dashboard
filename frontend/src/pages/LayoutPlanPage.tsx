import { Box, Cable, Eye, EyeOff, Maximize, MousePointer2, RotateCcw, Search, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { wheelZoomFactor } from "../utils/wheelZoom";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { NetaReportChips } from "../components/common/NetaReportChips";
import { InfralinkEquipmentLink } from "../components/common/InfralinkEquipmentLink";
import { Button } from "../components/ui/button";
import { IsometricEquipment, SimpleIsometricSymbols } from "../components/layout/IsometricEquipment";
import { FeederCableAtpReports } from "../components/layout/FeederCableAtpReports";
import { LayoutCable } from "../components/layout/LayoutCable";
import { LayoutBackground } from "../components/layout/LayoutBackground";
import { useFrameState } from "../hooks/useFrameState";
import { useNetaReportManifest } from "../contexts/NetaReportManifestContext";
import type { LayoutCableRecord, LayoutEquipmentRecord, LayoutPlanManifest, PowerPlanRect } from "../types/data";
import { fetchJson } from "../utils/dataLoaders";
import { LAYOUT_CABLE_TEST_STATES, layoutCableTestState } from "../utils/cableTestUtils";
import { getLayoutCableReportNames } from "../utils/layoutReportUtils";
import { getNetaReportNames } from "../utils/netaReports";
import {
  DEVICE_KIND_LABELS, LAYOUT_VIEW_KEY, isNearbyCable, layoutCableLanes, layoutCablePath, layoutConnectionBounds, layoutDeviceHeight, layoutDeviceKind,
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

interface SearchSuggestion {
  record: LayoutEquipmentRecord;
  floorId: string;
  floorLabel: string;
}
interface PanState {
  pointerId: number;
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

export function LayoutPlanPage() {
  const netaReportManifest = useNetaReportManifest();
  const [isometric, setIsometric] = useState(() => {
    try { return localStorage.getItem(LAYOUT_VIEW_KEY) !== "plan"; } catch { return true; }
  });
  const [hasIsometric, setHasIsometric] = useState(isometric);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [showCables, setShowCables] = useState(true);
  const [manifest, setManifest] = useState<LayoutPlanManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [floorId, setFloorId] = useState("");
  const [overrides, setOverrides] = useState(readLayoutOverrides);
  const [storageError, setStorageError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
      setViewport(null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [retry]);

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

  const rows = useMemo(() => manifest ? visibleLayoutEquipment(manifest, floorId) : [], [manifest, floorId]);
  const connections = useMemo(() => placedLayoutCables(manifest?.cables ?? [], rows), [manifest, rows]);
  const cableGeometry = useMemo(() => {
    const lanes = layoutCableLanes(connections);
    return connections.map((connection, index) => ({ connection,
      path: layoutCablePath(connection, lanes[index]), route: isNearbyCable(connection) ? "arc" as const : "long" as const,
      zone: connection.source.fixed && connection.target.fixed ? "fixed" as const
        : connection.source.fixed || connection.target.fixed ? "mixed" as const : "room" as const,
      extent: layoutConnectionBounds(connection, lanes[index]),
    }));
  }, [connections]);
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
  const regions = useMemo(() => manifest ? visibleLayoutRegions(manifest, floorId) : [], [manifest, floorId]);
  const roomLabels = useMemo(() => layoutRoomLabels(regions), [regions]);
  // One coordinate frame for every floor keeps fixed devices in the same screen positions.
  const allBounds = useMemo(() => {
    if (!manifest) return { plan: layoutBounds([]), isometric: layoutBounds([]) };
    const allRecords = manifest.floors.flatMap((floor) => visibleLayoutEquipment(manifest, floor.floor_id));
    const allRegions = manifest.floors.flatMap((floor) => visibleLayoutRegions(manifest, floor.floor_id));
    const labels = layoutRoomLabels(allRegions);
    const records = [...allRecords, ...allRegions, ...labels];
    const cableBounds = manifest.floors.flatMap((floor) => {
      const floorConnections = placedLayoutCables(manifest.cables ?? [], visibleLayoutEquipment(manifest, floor.floor_id));
      const lanes = layoutCableLanes(floorConnections);
      return floorConnections.map((connection, index) => ({ rect: layoutConnectionBounds(connection, lanes[index]) }));
    });
    const roomCallouts = allRegions.filter((region) => region.kind === "room").map(projectedLayoutRoomLabel);
    return { plan: layoutBounds(records), isometric: layoutBounds([...records.map((record) => ({ rect: projectedLayoutBounds(record.rect, 32) })), ...roomCallouts, ...cableBounds]) };
  }, [manifest]);
  const fullBounds = isometric ? allBounds.isometric : allBounds.plan;
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
  const selected = rows.find((row) => row.annotation_id === selectedId);
  const selectedEquipmentReports = useMemo(() => getNetaReportNames(selected?.neta_test_report), [selected]);
  const selectedConnections = useMemo(() => selected ? cableIndex.byEquipment.get(selected.equipment_key) ?? [] : [], [selected, cableIndex]);
  const selectedCableCounts = useMemo(() => selectedConnections.reduce((counts, cable) => {
    const state = layoutCableTestState(cable);
    if (state === "updated" || state === "pending") counts.tested += 1;
    else if (state === "failed") counts.failed += 1;
    else counts.unconfirmed += 1;
    return counts;
  }, { tested: 0, failed: 0, unconfirmed: 0 }), [selectedConnections]);
  const connectedKeys = useMemo(() => new Set(selectedConnections.flatMap((cable) => [cable.source_equipment_key, cable.target_equipment_key])), [selectedConnections]);
  const cableEndpointKeys = selectedCable ? [selectedCable.source_equipment_key, selectedCable.target_equipment_key] : [];
  const rowIsDimmed = (row: LayoutEquipmentRecord) => isometric && selectedCable ? !cableEndpointKeys.includes(row.equipment_key)
    : isometric && selected ? !connectedKeys.has(row.equipment_key) && row.equipment_key !== selected.equipment_key
    : !!query && !row.equipment_key.includes(query);
  const inspected = rows.find((row) => row.annotation_id === inspection?.annotationId);
  const query = search.trim().toUpperCase().replace(/^IAD06-/, "");
  const statusOf = (row: LayoutEquipmentRecord) => layoutEquipmentStatus(row, overrides);
  const selectedRows = useMemo(() => [...new Map(rows.filter((row) => selectionKeys.has(row.equipment_key)).map((row) => [row.equipment_key, row])).values()], [rows, selectionKeys]);
  const eligibleRows = selectedRows.filter((row) => statusOf(row) !== "energized" && statusOf(row) !== "energizeToday");
  const cableDiagnosticCounts = useMemo(() => (manifest?.cable_diagnostics ?? []).reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1; return counts;
  }, {}), [manifest]);

  const suggestions = useMemo(() => {
    if (!manifest || !query) return [];
    const candidates: SearchSuggestion[] = [];
    const seen = new Set<string>();
    for (const floor of manifest.floors) {
      for (const record of visibleLayoutEquipment(manifest, floor.floor_id)) {
        const key = `${record.fixed ? "fixed" : floor.floor_id}:${record.equipment_key}`;
        if (seen.has(key) || !record.equipment_key.includes(query)) continue;
        seen.add(key);
        candidates.push({ record, floorId: record.fixed ? floorId : floor.floor_id, floorLabel: record.fixed ? "Fixed across floors" : floor.label });
      }
    }
    return candidates.sort((a, b) => Number(b.record.equipment_key === query) - Number(a.record.equipment_key === query) ||
      Number(b.record.equipment_key.startsWith(query)) - Number(a.record.equipment_key.startsWith(query)) ||
      a.record.label.localeCompare(b.record.label, undefined, { numeric: true })).slice(0, 12);
  }, [manifest, query, floorId]);

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
    setInspection(null);
    setSelectedId(record.annotation_id);
    setSelectedCableId(null);
    setViewport(layoutBounds([{ rect: isometric ? projectedLayoutBounds(record.rect, layoutDeviceHeight(record) + 25) : record.rect }]));
    setSelectionKeys(new Set());
    setSelectionMode(false);
  }

  function confirmSuggestion(suggestion: SearchSuggestion) {
    setFloorId(suggestion.floorId);
    setSearch(suggestion.record.label);
    setSearchOpen(false);
    if (!isometric) { focusDevice(suggestion.record); return; }
    setInspection(null);
    setSelectedId(suggestion.record.annotation_id);
    setSelectedCableId(null);
    setSelectionKeys(new Set());
    setSelectionMode(false);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    setInspection(null);
    event.currentTarget.focus?.({ preventScroll: true });
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport: bounds, moved: false,
      annotationId: (event.target as Element).closest("[data-annotation-id][role=button]")?.getAttribute("data-annotation-id") ?? null,
      cableId: (event.target as Element).closest("[data-cable-id][role=button]")?.getAttribute("data-cable-id") ?? null,
      mode: selectionMode ? "select" : "pan", additive: event.shiftKey,
    };
    panCullOffsetRef.current = { x: 0, y: 0 };
    if (isometric && !selectionMode && panLayerRef.current) {
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
    } else if (!pan.moved) {
      if (pan.annotationId) { setSelectedId(pan.annotationId); setSelectedCableId(null); }
      else if (pan.cableId) { setSelectedCableId(pan.cableId); setSelectedId(null); }
      else if (isometric) clearFocus();
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
    if (selectionMode) toggleEquipmentSelection(record.equipment_key);
    else { setSelectedId(record.annotation_id); setSelectedCableId(null); }
  }, [selectionMode, toggleEquipmentSelection]);
  const selectCable = useCallback((cableId: string) => { setSelectedCableId(cableId); setSelectedId(null); }, []);
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
    setIsometric(next); setViewport(null); setInspection(null); setSelectionKeys(new Set()); setSelectionBox(null);
    panRef.current = null;
    setPanCullViewport(null);
    if (panLayerRef.current) { panLayerRef.current.style.transform = ""; panLayerRef.current.style.willChange = ""; }
    try { localStorage.setItem(LAYOUT_VIEW_KEY, next ? "isometric" : "plan"); } catch { /* View works without persistence. */ }
  }

  function clearFocus() {
    setSelectedId(null); setSelectedCableId(null); setInspection(null); setSearch(""); setSearchOpen(false);
    setSelectionKeys(new Set());
  }

  function restoreGlobalView() {
    clearFocus(); setViewport(null); setSelectionMode(false); setSelectionBox(null);
    panRef.current = null;
  }

  function focusCable(cableId: string) {
    setSelectedCableId(cableId); setInspection(null); setSelectionMode(false); setSelectionKeys(new Set()); setSearch(""); setSearchOpen(false);
    const connection = connections.find((item) => item.cable.cable_id === cableId);
    if (connection) setViewport(isometric ? layoutBounds([{ rect: cableGeometry.find(({ connection: item }) => item.cable.cable_id === cableId)?.extent
      ?? layoutConnectionBounds(connection) }])
      : layoutBounds([connection.source, connection.target]));
  }

  if (loading) return <LoadingState />;
  if (!manifest) return <ErrorState message="Layout data could not be loaded. Run the Layout ETL builder and retry." onRetry={() => setRetry((value) => value + 1)} />;
  if (!manifest.floors.length) return <EmptyState title="No layout floors available" description="No configured floor drawing is available. Refresh the layout data after adding it." />;

  const isCableActive = (cable: LayoutCableRecord) => selectedCableId ? selectedCableId === cable.cable_id : !!selected &&
    [cable.source_equipment_key, cable.target_equipment_key].includes(selected.equipment_key);
  const renderCable = ({ connection, path, route, zone }: (typeof cableGeometry)[number]) => {
    const cable = connection.cable;
    const active = isCableActive(cable);
    const dimmed = ((!!selectedCableId || !!selected) && !active) || (!!query && !active &&
      ![cable.cable_id, cable.source_equipment_key ?? "", cable.target_equipment_key ?? ""].some((key) => key.toUpperCase().includes(query)));
    return <LayoutCable key={cable.cable_id} cable={cable} path={path} route={route} zone={zone} selected={selectedCableId === cable.cable_id}
      active={active} dimmed={dimmed} selectionMode={selectionMode} onSelect={selectCable} />;
  };

  const cableDetails = isometric && selectedCable ? <div key={selectedCable.cable_id} className="space-y-3" aria-label="Cable details">
    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">Cable connection</h3>
      <Button variant="ghost" aria-label="Close cable details" onClick={() => setSelectedCableId(null)}><X className="h-4 w-4" /></Button></div>
    <p className="break-all text-sm font-medium">{selectedCable.cable_id}</p>
    <InfralinkEquipmentLink equipmentId={selectedCable.cable_id} />
    <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
      <p className="break-all">From: {selectedCable.source_equipment_key ?? "Unresolved"}</p>
      <p className="break-all">To: {selectedCable.target_equipment_key ?? "Unresolved"}</p>
    </div>
    <p className="text-sm font-medium" style={{ color: LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selectedCable)].color }}>{LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selectedCable)].label}</p>
    <p className="text-xs">Type: {selectedCable.equipment_type}</p>
    <p className="text-xs">Infralink: {selectedCable.system_element_status ?? "Unknown"}</p>
    <p className="text-xs">EPS daily: {selectedCable.eps_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selectedCable.eps_daily_test_date ? ` · ${selectedCable.eps_daily_test_date}` : ""}{selectedCable.eps_daily_report_name ? ` · ${selectedCable.eps_daily_report_name}` : ""}</p>
    <p className="text-xs">MV daily: {selectedCable.mv_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selectedCable.mv_daily_test_date ? ` · ${selectedCable.mv_daily_test_date}` : ""}</p>
    <p className="text-xs">NETA: {selectedCable.neta_complete ? "Complete" : "Not confirmed"}</p>
    <FeederCableAtpReports key={selectedCable.cable_id} files={selectedCable.feeder_cable_atp_files ?? []}
      names={selectedCable.feeder_cable_atp_names ?? []} required={selectedCable.feeder_cable_atp_required ?? false} />
    {selectedCableReports.length ? <section className="space-y-2" aria-label="Cable test reports">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">Cable NETA reports</h4>
      <div className="max-h-48 overflow-y-auto pr-1 [scrollbar-gutter:stable]" role="region" aria-label="Cable NETA report list" tabIndex={0}>
        <NetaReportChips reports={selectedCableReports} showLinkedFileNames stackedCompact />
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
    <div className="relative z-20 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="flex gap-1 self-end rounded-md border p-1" role="group" aria-label="Layout view">
        <Button variant={!isometric ? "secondary" : "ghost"} aria-pressed={!isometric} onClick={() => switchView(false)}>2D plan</Button>
        <Button variant={isometric ? "secondary" : "ghost"} aria-pressed={isometric} onClick={() => switchView(true)}><Box className="mr-2 h-4 w-4" />2.5D</Button>
      </div>
      <label className="space-y-1 text-sm font-medium">Floor
        <select aria-label="Floor" value={floorId} onChange={(event) => {
          setFloorId(event.target.value); setSelectedId(null); setSelectedCableId(null); setSearchOpen(false); setInspection(null); setSelectionKeys(new Set());
        }} className="block h-9 rounded-md border bg-background px-3">
          {manifest.floors.map((floor) => <option key={floor.floor_id} value={floor.floor_id}>{floor.label}</option>)}
        </select>
      </label>
      <div className="relative min-w-56 flex-1 space-y-1 text-sm font-medium"
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
        <label htmlFor="layout-equipment-search">Find equipment</label>
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
            }} placeholder={isometric ? "Equipment ID · Enter to select" : "Equipment ID · Enter to zoom"}
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3" />
        </div>
        {searchOpen && query ? <div id="layout-equipment-suggestions" role="listbox" aria-label="Equipment suggestions"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-card p-1 shadow-lg">
          {suggestions.length ? suggestions.map((suggestion, index) => <button type="button" role="option"
            id={`layout-equipment-option-${index}`} aria-selected={index === activeSearchIndex}
            key={`${suggestion.floorId}:${suggestion.record.annotation_id}`}
            className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm ${index === activeSearchIndex ? "bg-accent" : "hover:bg-accent"}`}
            onPointerDown={(event) => event.preventDefault()} onClick={() => confirmSuggestion(suggestion)}>
            <span>{suggestion.record.label}</span><span className="text-xs font-normal text-muted-foreground">{suggestion.floorLabel}</span>
          </button>) : <div className="px-3 py-2 text-sm text-muted-foreground">No matching equipment</div>}
        </div> : null}
      </div>
      <Button variant="outline" aria-label="Zoom out" onClick={() => { setInspection(null); setViewport(zoomLayoutViewport(bounds, fullBounds, 1.2)); }}><ZoomOut className="h-4 w-4" /></Button>
      <span className="pb-2 text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button variant="outline" aria-label="Zoom in" onClick={() => { setInspection(null); setViewport(zoomLayoutViewport(bounds, fullBounds, 0.82)); }}><ZoomIn className="h-4 w-4" /></Button>
      <Button variant="outline" onClick={restoreGlobalView}><Maximize className="mr-2 h-4 w-4" />{isometric ? "Global view" : "Fit layout"}</Button>
    </div>
    {isometric ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs">
      <span className="inline-flex items-center font-medium"><Cable className="mr-2 h-4 w-4" />Overhead cables ({connections.length})</span>
      <Button variant="outline" aria-pressed={!showCables} aria-controls="layout-cables" onClick={() => {
        setShowCables((value) => !value); setSelectedCableId(null);
      }}>
        {showCables ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {showCables ? "Hide all cables" : "Show all cables"}
      </Button>
      {Object.entries(LAYOUT_CABLE_TEST_STATES).map(([key, state]) => <span key={key} className="inline-flex items-center gap-2">
        <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={state.color} strokeWidth="2.5" strokeDasharray={state.dash} /></svg>{state.label}
      </span>)}
      <Button variant="ghost" className={selected || selectedCable ? undefined : "invisible"}
        disabled={!selected && !selectedCable} onClick={clearFocus}><X className="mr-2 h-4 w-4" />Clear focus</Button>
      <span className="w-full text-muted-foreground">Illustrative equipment heights and overhead routes. Select a device or cable to trace its connections. Terminations are hidden.</span>
      {!manifest.cables ? <span className="text-amber-700">Cable data is unavailable. Rebuild Layout data to load connections.</span> : null}
    </div> : null}
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={selectionMode ? "default" : "outline"} aria-pressed={selectionMode} onClick={() => {
        setSelectionMode((current) => !current); setSelectionKeys(new Set()); setSelectedId(null); setSelectedCableId(null); setInspection(null);
      }}><MousePointer2 className="mr-2 h-4 w-4" />Box select</Button>
      {selectionMode ? <>
        <span role="status" className="text-sm text-muted-foreground">{selectedRows.length} selected · {eligibleRows.length} eligible</span>
        <Button disabled={!eligibleRows.length} onClick={() => saveOverrides(planLayoutSelection(rows, selectionKeys, overrides))}>
          <Zap className="mr-2 h-4 w-4 text-orange-500" />Energize today ({eligibleRows.length})
        </Button>
        <Button variant="ghost" disabled={!selectionKeys.size} onClick={() => setSelectionKeys(new Set())}><X className="mr-2 h-4 w-4" />Clear selection</Button>
        <span className="text-xs text-muted-foreground">Drag to enclose equipment; Shift + drag adds more. Energized devices are skipped.</span>
      </> : null}
    </div>
    <div className="flex flex-wrap gap-4 text-sm">
      {(Object.keys(LAYOUT_STATUS_LABELS) as LayoutStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-2">
        {status === "energized" || status === "energizeToday" ? <Zap className="h-4 w-4" color={LAYOUT_STATUS_COLORS[status].stroke} fill={LAYOUT_STATUS_COLORS[status].stroke} />
          : <span className="h-3 w-3 rounded border" style={{ backgroundColor: LAYOUT_STATUS_COLORS[status].fill, borderColor: LAYOUT_STATUS_COLORS[status].stroke }} />}
        {LAYOUT_STATUS_LABELS[status]} ({rows.filter((row) => statusOf(row) === status).length})
      </span>)}
      <span className="text-muted-foreground">PODs and rooms are reference areas</span>
    </div>
    {isometric ? <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
      <Zap className="h-5 w-5 shrink-0 fill-red-700 text-red-700" aria-hidden="true" />
      Electrical hazard: breathing lightning marks energized equipment and equipment scheduled to energize today.
    </p> : null}
    <p className="text-xs text-muted-foreground">{isometric
      ? "Click equipment or a cable to trace it. Click empty space to clear focus. Global view or Esc restores the full layout. Drag to pan; scroll to zoom."
      : "Hover or focus equipment to read its full ID. Drag to pan; scroll to zoom. Confirm a search suggestion to zoom to the device. Energized equipment cannot be planned again. Reset restores Excel values for all floors."}</p>
    {storageError ? <p role="alert" className="text-sm text-amber-700">Browser storage is unavailable. Changes apply for this visit only.</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div ref={mapRef} className="relative h-[68vh] min-h-[400px] overflow-hidden rounded-lg border bg-white" aria-label="Layout map">
        <div ref={panLayerRef} data-layout-pan="true" className="relative h-full w-full">
        <svg ref={svgRef} role="img" tabIndex={0} aria-label={`${manifest.floors.find((floor) => floor.floor_id === floorId)?.label} equipment layout`}
          viewBox={`${svgBounds.x} ${svgBounds.y} ${svgBounds.width} ${svgBounds.height}`} preserveAspectRatio="xMidYMid meet"
          className={`${isometric ? "absolute -left-[40%] -top-[40%] h-[180%] w-[180%]" : "h-full w-full"} select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selectionMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`} style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={(event) => endPan(event)} onPointerCancel={(event) => endPan(event, true)}
          onKeyDown={(event) => { if (event.key === "Escape") {
            if (isometric && !selectionMode) restoreGlobalView(); else { setInspection(null); cancelSelectionGesture(); }
          } }}
          onClickCapture={(event) => { if (suppressClickRef.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
          {hasIsometric ? <SimpleIsometricSymbols /> : null}
          <g data-layout-scene="true">
          <LayoutBackground regions={regions} roomLabels={roomLabels} isometric={isometric} />
          <g data-layout-layer="equipment">
            {drawnRows.map((row) => {
              const selected = selectionMode ? selectionKeys.has(row.equipment_key)
                : selectedId === row.annotation_id || (isometric && cableEndpointKeys.includes(row.equipment_key));
              const inspected = inspection?.annotationId === row.annotation_id;
              const projectedWidthPixels = (row.rect.width + row.rect.height) * pixelsPerUnit;
              return <EquipmentRectangle key={row.annotation_id} record={row} status={statusOf(row)} isometric={isometric} hasIsometric={hasIsometric}
                selected={selected} dimmed={rowIsDimmed(row)} tooltipVisible={inspected}
                detailed={(!selectionMode && selected) || inspected || projectedWidthPixels >= detailThreshold}
                showLabel={(!selectionMode && selected) || inspected || projectedWidthPixels >= 12}
                compact={compact}
                onInspect={inspectDevice} onLeave={leaveDevice} onSelect={selectDevice} />;
            })}
          </g>
          {isometric && showCables ? <g id="layout-cables" data-layout-layer="cables">
            {drawnCables.map(renderCable)}
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
        {inspected && inspection ? <div id="layout-equipment-tooltip" role="tooltip"
          className="pointer-events-none absolute z-10 w-72 max-w-[calc(100%-24px)] rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
          style={{ left: inspection.left, top: inspection.top }}>
          <p className="break-all text-base font-semibold leading-snug">{inspected.matched_equipment_id ?? inspected.label}</p>
          <p className="mt-2 text-sm font-medium" style={{ color: LAYOUT_STATUS_COLORS[statusOf(inspected)].stroke }}>{LAYOUT_STATUS_LABELS[statusOf(inspected)]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{inspected.fixed ? "Fixed across floors" : "Floor equipment"} · Select for details</p>
        </div> : null}
      </div>
      <div className="relative h-[68vh] min-h-[400px]">
      <aside className="h-full space-y-4 overflow-y-auto overscroll-contain rounded-lg border bg-card p-4 [scrollbar-gutter:stable]">
        {!selected && cableDetails ? <div className="border-b pb-4">{cableDetails}</div> : null}
        {selected ? <div className="space-y-3">
          <h3 className="break-all font-semibold">{selected.matched_equipment_id ?? selected.label}</h3>
          <InfralinkEquipmentLink equipmentId={selected.matched_equipment_id} matchStatus={selected.match_status} />
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
          <p className="text-xs text-muted-foreground">{selected.fixed ? "Fixed across all floors" : "Floor equipment"} · {selected.match_status}</p>
          {isometric ? <p className="text-xs text-muted-foreground">{DEVICE_KIND_LABELS[layoutDeviceKind(selected)]}</p> : null}
          <p className="text-sm">Excel energized date: {selected.energized_completed_at ?? "No completed date"}</p>
          <p className="text-sm">System status: {selected.system_element_status ?? "Unknown"}</p>
          <p className="text-sm font-medium">{LAYOUT_STATUS_LABELS[statusOf(selected)]}</p>
          {selectedEquipmentReports.length ? <section className="space-y-2" aria-label="Equipment test reports">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">NETA test reports</h4>
            <div className="h-48 overflow-y-auto pr-1 [scrollbar-gutter:stable]" role="region" aria-label="Equipment NETA report list" tabIndex={0}>
              <NetaReportChips reports={selectedEquipmentReports} compactNameMode="gc" showLinkedFileNames stackedCompact />
            </div>
          </section> : null}
          <p className="text-xs text-muted-foreground">{overrides[selected.equipment_key] && !selected.energized_completed_at ? "Manual override · saved in this browser" : "From SystemElements Excel"}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => focusDevice(selected)}>Zoom to device</Button>
            <Button variant="ghost" disabled={!overrides[selected.equipment_key]} onClick={() => {
              const next = { ...overrides }; delete next[selected.equipment_key]; saveOverrides(next);
            }}>Reset device</Button></div>
        </div> : <p className="text-sm text-muted-foreground">Select equipment or confirm a search suggestion to view its details.</p>}
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
