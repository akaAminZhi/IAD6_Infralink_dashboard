import {
  Boxes,
  Cable,
  CircleDot,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "../components/common/EmptyState";
import type {
  DashboardData,
  PowerPlanAnnotation,
  PowerPlanPageRecord,
  PowerPlanRect,
} from "../types/data";

interface MvEquipmentPageProps {
  data: DashboardData;
}

interface PanState {
  pointerId: number;
  clientX: number;
  clientY: number;
  viewport: PowerPlanRect;
  moved: boolean;
}

const MV_DOCUMENT_NAME = "electrical-iad6-mv.pdf";

function isConnection(annotation: PowerPlanAnnotation): boolean {
  return (
    annotation.kind === "connection" ||
    ["line", "polyline", "polygon"].includes(
      String(annotation.annotation_type ?? "").toLowerCase(),
    )
  );
}

function isTermination(annotation: PowerPlanAnnotation): boolean {
  return !isConnection(annotation) && (
    annotation.kind === "termination" || annotation.label.toUpperCase().includes("FD")
  );
}

function isTransformer(annotation: PowerPlanAnnotation): boolean {
  return (
    !isConnection(annotation) &&
    !isTermination(annotation) &&
    annotation.label.toUpperCase().includes("TX")
  );
}

export function roundedCablePath(points: PowerPlanAnnotation["vertices"], radius = 20): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    if (incomingLength === 0 || outgoingLength === 0) continue;

    const cornerRadius = Math.min(radius, incomingLength * 0.42, outgoingLength * 0.42);
    const entry = {
      x: current.x + ((previous.x - current.x) / incomingLength) * cornerRadius,
      y: current.y + ((previous.y - current.y) / incomingLength) * cornerRadius,
    };
    const exit = {
      x: current.x + ((next.x - current.x) / outgoingLength) * cornerRadius,
      y: current.y + ((next.y - current.y) / outgoingLength) * cornerRadius,
    };
    commands.push(
      `L ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`,
      `Q ${current.x} ${current.y} ${exit.x.toFixed(3)} ${exit.y.toFixed(3)}`,
    );
  }
  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

function annotationBounds(page: PowerPlanPageRecord, padding = 70): PowerPlanRect {
  if (page.annotations.length === 0) {
    return { x: 0, y: 0, width: page.width, height: page.height };
  }
  const points = page.annotations.flatMap((annotation) => [
    { x: annotation.rect.x, y: annotation.rect.y },
    {
      x: annotation.rect.x + annotation.rect.width,
      y: annotation.rect.y + annotation.rect.height,
    },
    ...(annotation.vertices ?? []),
  ]);
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - padding);
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - padding);
  const maxX = Math.min(page.width, Math.max(...points.map((point) => point.x)) + padding);
  const maxY = Math.min(page.height, Math.max(...points.map((point) => point.y)) + padding);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function combineMvPages(pages: PowerPlanPageRecord[]): PowerPlanPageRecord | null {
  if (pages.length === 0) return null;

  const annotatedPages = pages.filter((page) => page.annotations.length > 0);
  if (annotatedPages.length === 0) {
    return {
      ...pages[0],
      page_id: "electrical-iad6-mv-combined",
      page_number: 0,
      page_label: "Electrical-IAD6-MV / Combined",
      annotations: [],
    };
  }

  const canvasPadding = 70;
  const pageGap = 180;
  let cursorX = canvasPadding;
  let maxContentHeight = 1;
  const annotations: PowerPlanAnnotation[] = [];

  annotatedPages.forEach((page) => {
    const bounds = annotationBounds(page, 0);
    const offsetX = cursorX - bounds.x;
    const offsetY = canvasPadding - bounds.y;
    page.annotations.forEach((annotation) => {
      annotations.push({
        ...annotation,
        rect: {
          ...annotation.rect,
          x: annotation.rect.x + offsetX,
          y: annotation.rect.y + offsetY,
        },
        center: {
          x: annotation.center.x + offsetX,
          y: annotation.center.y + offsetY,
        },
        vertices: annotation.vertices?.map((point) => ({
          x: point.x + offsetX,
          y: point.y + offsetY,
        })),
      });
    });
    cursorX += bounds.width + pageGap;
    maxContentHeight = Math.max(maxContentHeight, bounds.height);
  });

  return {
    page_id: "electrical-iad6-mv-combined",
    document_name: pages[0].document_name,
    page_number: 0,
    page_label: "Electrical-IAD6-MV / Combined",
    width: cursorX - pageGap + canvasPadding,
    height: maxContentHeight + canvasPadding * 2,
    annotations,
  };
}

function zoomViewport(
  current: PowerPlanRect,
  full: PowerPlanRect,
  factor: number,
  anchorX = 0.5,
  anchorY = 0.5,
): PowerPlanRect {
  const width = Math.min(full.width * 2.5, Math.max(full.width * 0.18, current.width * factor));
  const height = width * (current.height / current.width);
  return {
    x: current.x + (current.width - width) * anchorX,
    y: current.y + (current.height - height) * anchorY,
    width,
    height,
  };
}

interface MvStatusPalette {
  fill: string;
  stroke: string;
  text: string;
}

type MvStatusHighlight = "shipToSite" | "installationComplete" | "neutral";

const NEUTRAL_PALETTE: MvStatusPalette = {
  fill: "#f8fafc",
  stroke: "#64748b",
  text: "#0f172a",
};

const SHIP_TO_SITE_PALETTE: MvStatusPalette = {
  fill: "#f3e8ff",
  stroke: "#7e22ce",
  text: "#581c87",
};

const INSTALLATION_COMPLETE_PALETTE: MvStatusPalette = {
  fill: "#d1fae5",
  stroke: "#059669",
  text: "#065f46",
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function getStatusHighlight(annotation: PowerPlanAnnotation): MvStatusHighlight {
  const status = normalizeStatus(annotation.system_element_status);
  if (status.includes("SHIP TO SITE")) return "shipToSite";
  if (
    (isConnection(annotation) || isTermination(annotation)) &&
    status === "INSTALLATION COMPLETE"
  ) {
    return "installationComplete";
  }
  return "neutral";
}

function getAnnotationPalette(annotation: PowerPlanAnnotation): MvStatusPalette {
  const highlight = getStatusHighlight(annotation);
  if (highlight === "shipToSite") return SHIP_TO_SITE_PALETTE;
  if (highlight === "installationComplete") {
    return INSTALLATION_COMPLETE_PALETTE;
  }
  return NEUTRAL_PALETTE;
}

function MvScrew({
  annotation,
  selected,
  onSelect,
}: {
  annotation: PowerPlanAnnotation;
  selected: boolean;
  onSelect: () => void;
}) {
  const palette = getAnnotationPalette(annotation);
  const radius = Math.max(
    13,
    Math.min(18, (Math.max(annotation.rect.width, annotation.rect.height) / 2) * 1.45),
  );
  const { x, y } = annotation.center;
  const socketRadius = radius * 0.52;
  const socketPoints = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    return `${x + Math.cos(angle) * socketRadius},${y + Math.sin(angle) * socketRadius}`;
  }).join(" ");
  return (
    <g
      aria-label={`${annotation.label}, termination`}
      className="cursor-pointer outline-none"
      data-mv-termination="true"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <title>{`${annotation.label} - ${annotation.system_element_status || "Status unavailable"}`}</title>
      <circle
        cx={x}
        cy={y}
        fill={palette.fill}
        r={radius + (selected ? 3 : 1)}
        stroke={selected ? "#0f172a" : palette.stroke}
        strokeWidth={selected ? 4 : 2.5}
      />
      <circle cx={x} cy={y} fill="none" r={radius * 0.76} stroke={palette.stroke} strokeWidth="1" />
      <polygon
        fill={palette.fill}
        points={socketPoints}
        stroke={palette.text}
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </g>
  );
}

function MvEquipmentNode({
  annotation,
  selected,
  onSelect,
}: {
  annotation: PowerPlanAnnotation;
  selected: boolean;
  onSelect: () => void;
}) {
  const palette = getAnnotationPalette(annotation);
  const fontSize = Math.max(13, Math.min(22, annotation.rect.width / Math.max(5, annotation.label.length * 0.62)));
  const cornerRadius = Math.max(9, Math.min(24, annotation.rect.height * 0.18));
  return (
    <g
      aria-label={`${annotation.label}, MV equipment`}
      className="cursor-pointer outline-none"
      data-mv-equipment="true"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <title>{`${annotation.label} - ${annotation.system_element_status || "Status unavailable"}`}</title>
      <rect
        fill="#64748b"
        fillOpacity="0.14"
        height={annotation.rect.height}
        rx={cornerRadius}
        width={annotation.rect.width}
        x={annotation.rect.x + 5}
        y={annotation.rect.y + 7}
      />
      <rect
        fill={palette.fill}
        height={annotation.rect.height}
        rx={cornerRadius}
        stroke={selected ? "#0f172a" : palette.stroke}
        strokeWidth={selected ? 5 : 3}
        width={annotation.rect.width}
        x={annotation.rect.x}
        y={annotation.rect.y}
      />
      <rect
        fill={palette.stroke}
        height={Math.max(7, annotation.rect.height * 0.06)}
        rx={cornerRadius}
        width={annotation.rect.width * 0.74}
        x={annotation.rect.x + annotation.rect.width * 0.13}
        y={annotation.rect.y}
      />
      <text
        dominantBaseline="middle"
        fill={palette.text}
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing={0}
        textAnchor="middle"
        x={annotation.center.x}
        y={annotation.center.y + 2}
      >
        {annotation.label}
      </text>
    </g>
  );
}

function MvTransformerNode({
  annotation,
  selected,
  onSelect,
}: {
  annotation: PowerPlanAnnotation;
  selected: boolean;
  onSelect: () => void;
}) {
  const palette = getAnnotationPalette(annotation);
  const { x, y, width, height } = annotation.rect;
  const cornerRadius = Math.max(10, Math.min(22, height * 0.14));
  const coilRadius = Math.max(10, Math.min(width * 0.21, height * 0.13));
  const coilY = y + height * 0.42;
  const labelSize = Math.max(12, Math.min(18, width / Math.max(5, annotation.label.length * 0.62)));
  return (
    <g
      aria-label={`${annotation.label}, MV transformer`}
      className="cursor-pointer outline-none"
      data-mv-equipment="true"
      data-mv-transformer="true"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <title>{`${annotation.label} - ${annotation.system_element_status || "Status unavailable"}`}</title>
      <rect
        fill="#64748b"
        fillOpacity="0.14"
        height={height}
        rx={cornerRadius}
        width={width}
        x={x + 5}
        y={y + 7}
      />
      <rect
        fill={palette.fill}
        height={height}
        rx={cornerRadius}
        stroke={selected ? "#0f172a" : palette.stroke}
        strokeWidth={selected ? 5 : 3}
        width={width}
        x={x}
        y={y}
      />
      <rect
        fill={palette.stroke}
        height={Math.max(7, height * 0.055)}
        rx={cornerRadius}
        width={width * 0.7}
        x={x + width * 0.15}
        y={y}
      />
      <circle
        cx={annotation.center.x - coilRadius * 0.55}
        cy={coilY}
        fill="#ffffff"
        r={coilRadius}
        stroke={palette.stroke}
        strokeWidth="3"
      />
      <circle
        cx={annotation.center.x + coilRadius * 0.55}
        cy={coilY}
        fill="#ffffff"
        r={coilRadius}
        stroke={palette.stroke}
        strokeWidth="3"
      />
      <line
        stroke={palette.stroke}
        strokeLinecap="round"
        strokeWidth="3"
        x1={annotation.center.x}
        x2={annotation.center.x}
        y1={coilY - coilRadius * 0.7}
        y2={coilY + coilRadius * 0.7}
      />
      <text
        fill={palette.text}
        fontSize={labelSize}
        fontWeight="700"
        letterSpacing={0}
        textAnchor="middle"
        x={annotation.center.x}
        y={y + height * 0.82}
      >
        {annotation.label}
      </text>
    </g>
  );
}

export function MvEquipmentPage({ data }: MvEquipmentPageProps) {
  const pages = useMemo(
    () =>
      (data.powerPlanManifest?.pages ?? [])
        .filter((page) => page.document_name.toLowerCase() === MV_DOCUMENT_NAME)
        .sort((left, right) => left.page_number - right.page_number),
    [data.powerPlanManifest],
  );
  const currentPage = useMemo(() => combineMvPages(pages), [pages]);
  const fullViewport = useMemo(
    () => currentPage ? annotationBounds(currentPage) : { x: 0, y: 0, width: 1, height: 1 },
    [currentPage],
  );
  const [viewport, setViewport] = useState<PowerPlanRect>(fullViewport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setViewport(fullViewport);
    setSelectedId(null);
  }, [fullViewport]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = svg.getBoundingClientRect();
      const anchorX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const anchorY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      setViewport((current) =>
        zoomViewport(current, fullViewport, event.deltaY < 0 ? 0.84 : 1.18, anchorX, anchorY),
      );
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [fullViewport]);

  if (!currentPage) {
    return (
      <EmptyState
        description="Run the ETL after adding annotations to Electrical-IAD6-MV.pdf."
        title="No MV equipment plan found."
      />
    );
  }

  const connections = currentPage.annotations.filter(isConnection);
  const terminations = currentPage.annotations.filter(isTermination);
  const equipment = currentPage.annotations.filter(
    (annotation) => !isConnection(annotation) && !isTermination(annotation),
  );
  const selected = currentPage.annotations.find((annotation) => annotation.annotation_id === selectedId) ?? null;
  const selectedPalette = selected ? getAnnotationPalette(selected) : NEUTRAL_PALETTE;
  const highlightCounts = currentPage.annotations.reduce<Record<MvStatusHighlight, number>>(
    (counts, annotation) => {
      if (["equipment", "termination", "connection"].includes(annotation.kind)) {
        counts[getStatusHighlight(annotation)] += 1;
      }
      return counts;
    },
    { shipToSite: 0, installationComplete: 0, neutral: 0 },
  );

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (
      (event.target as Element).closest(
        "[data-mv-equipment='true'], [data-mv-termination='true'], [data-mv-connection='true']",
      )
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewport,
      moved: false,
    };
    suppressClickRef.current = false;
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - pan.clientX;
    const dy = event.clientY - pan.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true;
    setViewport({
      ...pan.viewport,
      x: pan.viewport.x - (dx / Math.max(1, bounds.width)) * pan.viewport.width,
      y: pan.viewport.y - (dy / Math.max(1, bounds.height)) * pan.viewport.height,
    });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (pan?.moved) {
      suppressClickRef.current = true;
      queueMicrotask(() => {
        suppressClickRef.current = false;
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      <section className="rounded-md border bg-card">
        <div className="border-b p-4">
          <div>
            <div className="flex items-center gap-2">
              <Cable className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h1 className="text-lg font-semibold">MV Equipment</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Unified medium-voltage equipment, cable, and termination layout.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-slate-50 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <span className="h-4 w-7 rounded-[5px] border-2 border-slate-500 bg-white" />
            {`${equipment.length} equipment`}
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-200">
              <span className="h-2.5 w-2.5 border-2 border-slate-600 bg-white [clip-path:polygon(25%_7%,75%_7%,100%_50%,75%_93%,25%_93%,0_50%)]" />
            </span>
            {`${terminations.length} termination${terminations.length === 1 ? "" : "s"}`}
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <span className="h-0 w-8 border-t-2 border-slate-500" />
            {`${connections.length} connection${connections.length === 1 ? "" : "s"}`}
          </span>
          <span className="h-5 w-px bg-slate-300" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-purple-700 bg-purple-100" />
            {`Ship to Site ${highlightCounts.shipToSite}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-emerald-600 bg-emerald-100" />
            {`Cable / Termination Installation Complete ${highlightCounts.installationComplete}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-slate-500 bg-white" />
            {`Other status ${highlightCounts.neutral}`}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
            Drag to pan · Scroll to zoom
          </span>
          <div className="flex items-center gap-1">
            <span className="min-w-12 text-center text-[11px] font-semibold text-slate-600">
              {`${Math.round((fullViewport.width / viewport.width) * 100)}%`}
            </span>
            <button
              aria-label="Zoom out MV plan"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
              onClick={() => setViewport((current) => zoomViewport(current, fullViewport, 1.2))}
              title="Zoom out"
              type="button"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              aria-label="Zoom in MV plan"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
              onClick={() => setViewport((current) => zoomViewport(current, fullViewport, 0.82))}
              title="Zoom in"
              type="button"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              aria-label="Reset MV plan view"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
              onClick={() => setViewport(fullViewport)}
              title="Reset view"
              type="button"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {currentPage.annotations.length === 0 ? (
          <div className="flex min-h-[620px] items-center justify-center bg-slate-100 p-6 text-center">
            <div>
              <RotateCcw className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold">No MV annotations available</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add annotations to either source page, then run the ETL again.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-h-[680px] overflow-hidden bg-slate-100 p-3">
              <svg
                aria-label="Unified MV equipment annotation schematic"
                className="h-full min-h-[656px] w-full cursor-grab select-none active:cursor-grabbing"
                onClick={() => {
                  if (!suppressClickRef.current) setSelectedId(null);
                }}
                onPointerCancel={handlePointerUp}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                preserveAspectRatio="xMidYMid meet"
                ref={svgRef}
                role="img"
                shapeRendering="geometricPrecision"
                style={{ touchAction: "none" }}
                viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
              >
                <defs>
                  <pattern height="48" id="mv-grid" patternUnits="userSpaceOnUse" width="48">
                    <path d="M48 0H0V48" fill="none" stroke="#dbe4ee" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect
                  fill="#f8fafc"
                  height={currentPage.height}
                  width={currentPage.width}
                />
                <rect
                  fill="url(#mv-grid)"
                  height={currentPage.height}
                  width={currentPage.width}
                />
                {connections.map((annotation) => {
                  const palette = getAnnotationPalette(annotation);
                  const cablePath = roundedCablePath(annotation.vertices);
                  return (
                    <g
                      aria-label={`${annotation.label}, cable connection`}
                      className="cursor-pointer outline-none"
                      data-mv-connection="true"
                      key={annotation.annotation_id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(annotation.annotation_id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(annotation.annotation_id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <title>{`${annotation.label} - ${annotation.system_element_status || "Status unavailable"}`}</title>
                      <path
                        d={cablePath}
                        fill="none"
                        pointerEvents="stroke"
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="28"
                      />
                      <path
                        d={cablePath}
                        fill="none"
                        pointerEvents="none"
                        stroke={selectedId === annotation.annotation_id ? "#0f172a" : palette.stroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity={selectedId === annotation.annotation_id ? 1 : 0.86}
                        strokeWidth={selectedId === annotation.annotation_id ? 14 : 10}
                      />
                    </g>
                  );
                })}
                {equipment.map((annotation) =>
                  isTransformer(annotation) ? (
                    <MvTransformerNode
                      annotation={annotation}
                      key={annotation.annotation_id}
                      onSelect={() => setSelectedId(annotation.annotation_id)}
                      selected={selectedId === annotation.annotation_id}
                    />
                  ) : (
                    <MvEquipmentNode
                      annotation={annotation}
                      key={annotation.annotation_id}
                      onSelect={() => setSelectedId(annotation.annotation_id)}
                      selected={selectedId === annotation.annotation_id}
                    />
                  ),
                )}
                {terminations.map((annotation) => (
                  <MvScrew
                    annotation={annotation}
                    key={annotation.annotation_id}
                    onSelect={() => setSelectedId(annotation.annotation_id)}
                    selected={selectedId === annotation.annotation_id}
                  />
                ))}
              </svg>
            </div>
            <aside className="border-t bg-card p-4 xl:border-l xl:border-t-0">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Selected annotation</div>
              {selected ? (
                <div className="mt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-slate-50">
                    {isConnection(selected) ? (
                      <Cable className="h-5 w-5 text-slate-700" aria-hidden="true" />
                    ) : isTermination(selected) ? (
                      <CircleDot className="h-5 w-5 text-slate-700" aria-hidden="true" />
                    ) : (
                      <Boxes className="h-5 w-5 text-slate-700" aria-hidden="true" />
                    )}
                  </div>
                  <h2 className="mt-3 break-words text-base font-semibold">{selected.label}</h2>
                  <div
                    className="mt-3 inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: selectedPalette.fill,
                      borderColor: selectedPalette.stroke,
                      color: selectedPalette.text,
                    }}
                  >
                    {selected.system_element_status || "SystemElements status unavailable"}
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                        System Element Type
                      </dt>
                      <dd className="mt-1 break-words font-medium">
                        {selected.system_element_type || "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                        Matched System Element
                      </dt>
                      <dd className="mt-1 break-words font-medium">
                        {selected.matched_equipment_id || "Not matched"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5 rounded-md border border-dashed bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase text-slate-500">Details reserved</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Detailed information will be added here.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Select equipment, a transformer, a screw termination, or a cable to open its details.
                </p>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
