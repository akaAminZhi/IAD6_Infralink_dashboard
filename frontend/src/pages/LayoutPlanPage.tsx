import { Maximize, MousePointer2, RotateCcw, Search, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { Button } from "../components/ui/button";
import type { LayoutEquipmentRecord, LayoutPlanManifest, PowerPlanRect } from "../types/data";
import { fetchJson } from "../utils/dataLoaders";
import {
  equipmentInLayoutSelection, insetEquipmentRect, layoutBounds, layoutCanvasPoint, layoutEquipmentStatus, layoutRoomLabels,
  layoutSelectionRect, planLayoutSelection,
  LAYOUT_OVERRIDES_KEY, LAYOUT_STATUS_COLORS, LAYOUT_STATUS_LABELS, readLayoutOverrides,
  visibleLayoutEquipment, visibleLayoutRegions, zoomLayoutViewport, type LayoutStatus,
} from "../utils/layoutPlanUtils";

function EquipmentRectangle({ record, status, selected, dimmed, tooltipVisible, onSelect, onInspect, onLeave }: {
  record: LayoutEquipmentRecord;
  status: LayoutStatus;
  selected: boolean;
  dimmed: boolean;
  tooltipVisible: boolean;
  onSelect: () => void;
  onInspect: (element: SVGGElement) => void;
  onLeave: () => void;
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
      onPointerEnter={(event) => onInspect(event.currentTarget)} onPointerLeave={onLeave}
      onFocus={(event) => onInspect(event.currentTarget)} onBlur={onLeave}
      onClick={onSelect} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); }
      }} className="cursor-pointer outline-none focus:drop-shadow-md" opacity={dimmed ? 0.2 : 1}>
      <title>{`${record.label} · ${LAYOUT_STATUS_LABELS[status]}${record.fixed ? " · Fixed across floors" : ""}`}</title>
      <rect x={x} y={y} width={width} height={height} rx={Math.min(2, width / 4, height / 4)}
        fill={colors.fill} stroke={selected ? "#2563eb" : colors.stroke} strokeWidth={selected || status === "energized" ? 0.65 : 0.35} />
      {lines.map((line, index) => <text key={index} x={x + width / 2}
        y={y + height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.15}
        textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fill="#0f172a" pointerEvents="none">{line}</text>)}
    </g>
  );
}

function EquipmentLightning({ record, status, dimmed }: { record: LayoutEquipmentRecord; status: LayoutStatus; dimmed: boolean }) {
  if (status !== "energizeToday" && status !== "energized") return null;
  const { x, y, width } = insetEquipmentRect(record.rect);
  const size = Math.min(6, Math.max(3, width * 0.6));
  const color = LAYOUT_STATUS_COLORS[status].stroke;
  return <g transform={`translate(${x + width / 2 - size / 2}, ${y - size - 1})`} data-lightning-key={record.equipment_key} opacity={dimmed ? 0.2 : 1}>
    <Zap x={0} y={0} width={size} height={size} fill={color} color={color}
      className="animate-energisation-breathe" role="img" aria-label={`${record.label} ${LAYOUT_STATUS_LABELS[status]} lightning`} />
  </g>;
}

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
  mode: "pan" | "select";
  additive: boolean;
}

export function LayoutPlanPage() {
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
  const [viewport, setViewport] = useState<PowerPlanRect | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionKeys, setSelectionKeys] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<PowerPlanRect | null>(null);
  const [inspection, setInspection] = useState<{ annotationId: string; left: number; top: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<PanState | null>(null);
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

  const rows = useMemo(() => manifest ? visibleLayoutEquipment(manifest, floorId) : [], [manifest, floorId]);
  const regions = useMemo(() => manifest ? visibleLayoutRegions(manifest, floorId) : [], [manifest, floorId]);
  const roomLabels = useMemo(() => layoutRoomLabels(regions), [regions]);
  // One coordinate frame for every floor keeps fixed devices in the same screen positions.
  const fullBounds = useMemo(() => {
    if (!manifest) return layoutBounds([]);
    const allRecords = manifest.floors.flatMap((floor) => visibleLayoutEquipment(manifest, floor.floor_id));
    const allRegions = manifest.floors.flatMap((floor) => visibleLayoutRegions(manifest, floor.floor_id));
    const labels = layoutRoomLabels(allRegions);
    return layoutBounds([...allRecords, ...allRegions, ...labels]);
  }, [manifest]);
  const bounds = viewport ?? fullBounds;
  const zoom = fullBounds.width / bounds.width;
  const selected = rows.find((row) => row.annotation_id === selectedId);
  const inspected = rows.find((row) => row.annotation_id === inspection?.annotationId);
  const query = search.trim().toUpperCase().replace(/^IAD06-/, "");
  const statusOf = (row: LayoutEquipmentRecord) => layoutEquipmentStatus(row, overrides);
  const selectedRows = [...new Map(rows.filter((row) => selectionKeys.has(row.equipment_key)).map((row) => [row.equipment_key, row])).values()];
  const eligibleRows = selectedRows.filter((row) => statusOf(row) !== "energized" && statusOf(row) !== "energizeToday");

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

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || loading) return;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      if (!event.deltaY || panRef.current) return;
      setInspection(null);
      const canvas = svg!.getBoundingClientRect();
      setViewport((current) => {
        const view = current ?? fullBounds;
        return zoomLayoutViewport(view, fullBounds, event.deltaY < 0 ? 0.86 : 1.16,
          layoutCanvasPoint(view, canvas, event.clientX, event.clientY));
      });
    }
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [fullBounds, loading]);

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
    setViewport(layoutBounds([record]));
    setSelectionKeys(new Set());
    setSelectionMode(false);
  }

  function confirmSuggestion(suggestion: SearchSuggestion) {
    setFloorId(suggestion.floorId);
    setSearch(suggestion.record.label);
    setSearchOpen(false);
    focusDevice(suggestion.record);
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
      mode: selectionMode ? "select" : "pan", additive: event.shiftKey,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    const canvas = svgRef.current?.getBoundingClientRect();
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
    const scale = Math.max(Number.EPSILON, Math.min(canvas.width / pan.viewport.width, canvas.height / pan.viewport.height));
    setViewport({ ...pan.viewport, x: pan.viewport.x - (event.clientX - pan.x) / scale, y: pan.viewport.y - (event.clientY - pan.y) / scale });
  }

  function endPan(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
    suppressClickRef.current = pan.moved || cancelled || pan.mode === "select";
    setSelectionBox(null);
    if (cancelled) return;
    if (pan.mode === "select") {
      const canvas = event.currentTarget.getBoundingClientRect();
      if (pan.moved) {
        const found = equipmentInLayoutSelection(rows, layoutSelectionRect(
          layoutCanvasPoint(pan.viewport, canvas, pan.x, pan.y),
          layoutCanvasPoint(pan.viewport, canvas, event.clientX, event.clientY),
        ));
        setSelectionKeys((current) => pan.additive ? new Set([...current, ...found]) : found);
      } else if (pan.annotationId) {
        const record = rows.find((row) => row.annotation_id === pan.annotationId);
        if (record) toggleEquipmentSelection(record.equipment_key);
      } else if (!pan.additive) setSelectionKeys(new Set());
    } else if (!pan.moved && pan.annotationId) setSelectedId(pan.annotationId);
  }

  function toggleEquipmentSelection(key: string) {
    setSelectionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function cancelSelectionGesture() {
    const pan = panRef.current;
    if (pan?.mode === "select") {
      if (svgRef.current?.hasPointerCapture?.(pan.pointerId)) svgRef.current.releasePointerCapture(pan.pointerId);
      panRef.current = null;
      suppressClickRef.current = true;
      setSelectionBox(null);
    } else setSelectionKeys(new Set());
  }

  function inspectDevice(record: LayoutEquipmentRecord, element: SVGGElement) {
    const map = mapRef.current?.getBoundingClientRect();
    if (!map || panRef.current) return;
    const device = element.getBoundingClientRect();
    const left = Math.max(12, Math.min(device.right - map.left + 12, map.width - 300));
    const preferredTop = device.top - map.top - 124;
    const top = Math.max(12, Math.min(preferredTop >= 12 ? preferredTop : device.bottom - map.top + 12, map.height - 152));
    setInspection({ annotationId: record.annotation_id, left, top });
  }

  if (loading) return <LoadingState />;
  if (!manifest) return <ErrorState message="Layout data could not be loaded. Run the Layout ETL builder and retry." onRetry={() => setRetry((value) => value + 1)} />;
  if (!manifest.floors.length) return <EmptyState title="No layout floors available" description="No configured floor drawing is available. Refresh the layout data after adding it." />;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Layout</h2>
        <p className="mt-1 text-sm text-muted-foreground">{rows.length} rectangles · {new Set(rows.map((row) => row.equipment_key)).size} equipment IDs · {rows.filter((row) => row.fixed).length} fixed across floors · {rows.filter((row) => row.match_status !== "matched").length} unmatched / ambiguous</p></div>
      <Button variant="outline" onClick={() => saveOverrides({})} disabled={!Object.keys(overrides).length}>
        <RotateCcw className="mr-2 h-4 w-4" />Reset all statuses
      </Button>
    </div>
    <div className="relative z-20 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <label className="space-y-1 text-sm font-medium">Floor
        <select aria-label="Floor" value={floorId} onChange={(event) => {
          setFloorId(event.target.value); setSelectedId(null); setSearchOpen(false); setInspection(null); setSelectionKeys(new Set());
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
            }} placeholder="Equipment ID · Enter to zoom" className="h-9 w-full rounded-md border bg-background pl-9 pr-3" />
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
      <Button variant="outline" onClick={() => { setInspection(null); setViewport(null); }}><Maximize className="mr-2 h-4 w-4" />Fit layout</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={selectionMode ? "default" : "outline"} aria-pressed={selectionMode} onClick={() => {
        setSelectionMode((current) => !current); setSelectionKeys(new Set()); setSelectedId(null); setInspection(null);
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
    <p className="text-xs text-muted-foreground">Hover or focus equipment to read its full ID. Drag to pan; scroll to zoom. Confirm a search suggestion to zoom to the device. Energized equipment cannot be planned again. Reset restores Excel values for all floors.</p>
    {storageError ? <p role="alert" className="text-sm text-amber-700">Browser storage is unavailable. Changes apply for this visit only.</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div ref={mapRef} className="relative h-[68vh] min-h-[400px] overflow-hidden rounded-lg border bg-white" aria-label="Layout map">
        <svg ref={svgRef} role="img" tabIndex={0} aria-label={`${manifest.floors.find((floor) => floor.floor_id === floorId)?.label} equipment layout`}
          viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} preserveAspectRatio="xMidYMid meet"
          className={`h-full w-full select-none ${selectionMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`} style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={(event) => endPan(event)} onPointerCancel={(event) => endPan(event, true)}
          onKeyDown={(event) => { if (event.key === "Escape") { setInspection(null); cancelSelectionGesture(); } }}
          onClickCapture={(event) => { if (suppressClickRef.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
          <g pointerEvents="none" data-layout-layer="regions">
            {regions.map((region) => <g key={region.annotation_id} data-layout-region={region.kind} data-fixed={region.fixed}>
              <title>{region.label}</title>
              <rect {...region.rect} rx={region.kind === "pod" ? 1.5 : 2}
                fill={region.kind === "pod" ? "#eff6ff" : "#f8fafc"}
                stroke={region.kind === "pod" ? "#60a5fa" : "#94a3b8"} strokeWidth={0.45}
                strokeDasharray={region.kind === "pod" ? "2 1.5" : undefined} />
              {region.kind === "pod" ? <text x={region.rect.x + region.rect.width / 2} y={region.rect.y + region.rect.height / 2}
                textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(5, region.rect.width / 3)} fill="#2563eb">{region.label}</text> : null}
            </g>)}
          </g>
          <g pointerEvents="none" data-layout-layer="room-labels">
            {roomLabels.map(({ region, rect, fontSize }) => <g key={region.annotation_id} data-room-label={region.label}>
              <rect {...rect} fill="white" rx={1.5} />
              <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}
                fontWeight={600} fill="#334155">{region.label}</text>
            </g>)}
          </g>
          <g data-layout-layer="equipment">
            {rows.map((row) => <EquipmentRectangle key={row.annotation_id} record={row} status={statusOf(row)}
              selected={selectionMode ? selectionKeys.has(row.equipment_key) : selectedId === row.annotation_id}
              dimmed={!!query && !row.equipment_key.includes(query)}
              tooltipVisible={inspection?.annotationId === row.annotation_id} onInspect={(element) => inspectDevice(row, element)}
              onLeave={() => setInspection((current) => current?.annotationId === row.annotation_id ? null : current)}
              onSelect={() => selectionMode ? toggleEquipmentSelection(row.equipment_key) : setSelectedId(row.annotation_id)} />)}
          </g>
          <g pointerEvents="none" data-layout-layer="selection">
            {selectionBox ? <rect {...selectionBox} fill="#2563eb" fillOpacity={0.12} stroke="#2563eb"
              strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" /> : null}
          </g>
          <g pointerEvents="none" data-layout-layer="lightning">
            {rows.map((row) => <EquipmentLightning key={row.annotation_id} record={row} status={statusOf(row)}
              dimmed={!!query && !row.equipment_key.includes(query)} />)}
          </g>
        </svg>
        {inspected && inspection ? <div id="layout-equipment-tooltip" role="tooltip"
          className="pointer-events-none absolute z-10 w-72 max-w-[calc(100%-24px)] rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
          style={{ left: inspection.left, top: inspection.top }}>
          <p className="break-all text-base font-semibold leading-snug">{inspected.matched_equipment_id ?? inspected.label}</p>
          <p className="mt-2 text-sm font-medium" style={{ color: LAYOUT_STATUS_COLORS[statusOf(inspected)].stroke }}>{LAYOUT_STATUS_LABELS[statusOf(inspected)]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{inspected.fixed ? "Fixed across floors" : "Floor equipment"} · Select for details</p>
        </div> : null}
      </div>
      <aside className="space-y-4 rounded-lg border bg-card p-4">
        {selected ? <div className="space-y-3">
          <h3 className="break-all font-semibold">{selected.matched_equipment_id ?? selected.label}</h3>
          <p className="text-xs text-muted-foreground">{selected.fixed ? "Fixed across all floors" : "Floor equipment"} · {selected.match_status}</p>
          <p className="text-sm">Excel energized date: {selected.energized_completed_at ?? "No completed date"}</p>
          <p className="text-sm">System status: {selected.system_element_status ?? "Unknown"}</p>
          <p className="text-sm font-medium">{LAYOUT_STATUS_LABELS[statusOf(selected)]}</p>
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
          <p className="text-xs text-muted-foreground">{overrides[selected.equipment_key] && !selected.energized_completed_at ? "Manual override · saved in this browser" : "From SystemElements Excel"}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => focusDevice(selected)}>Zoom to device</Button>
            <Button variant="ghost" disabled={!overrides[selected.equipment_key]} onClick={() => {
              const next = { ...overrides }; delete next[selected.equipment_key]; saveOverrides(next);
            }}>Reset device</Button></div>
        </div> : <p className="text-sm text-muted-foreground">Select equipment or confirm a search suggestion to view its details.</p>}
        {manifest.diagnostics.length ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Source diagnostics ({manifest.diagnostics.length})</summary>
          <ul className="mt-2 max-h-60 space-y-1 overflow-auto">{manifest.diagnostics.map((item, index) => <li key={index}>{item.floor_id} · {item.label ?? "PDF"} · {item.reason}</li>)}</ul>
        </details> : null}
      </aside>
    </div>
  </div>;
}
