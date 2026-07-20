import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ClipboardCheck,
  Maximize2,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";

import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { IssueDetailDrawer } from "../components/issues/IssueDetailDrawer";
import type {
  CaseIssue,
  DashboardData,
  EpsTestItemRecord,
} from "../types/data";
import { cn } from "../utils/cn";
import { getEpsTestItemStatusLabel } from "../utils/epsTestItemUtils";
import {
  enrichIssuesWithPdmContext,
  isOpenIssue,
  type EnrichedIssue,
} from "../utils/issueUtils";
import {
  enrichPdmSchematicEquipment,
  isPowerPlanWaivedItem,
  POWER_PLAN_STATUS_COLORS,
  POWER_PLAN_STATUS_LABELS,
  type EnrichedPowerPlanEquipment,
  type PowerPlanEquipmentStatus,
} from "../utils/powerPlanUtils";
import { getSearchMatchScore, matchesSearchQuery } from "../utils/searchUtils";

interface PowerPlanPageProps {
  data: DashboardData;
}

const statusTone: Record<PowerPlanEquipmentStatus, "danger" | "warning" | "success" | "muted"> = {
  action: "danger",
  testing: "warning",
  ready: "success",
  noData: "muted",
};

const statusIcon: Record<PowerPlanEquipmentStatus, typeof CircleAlert> = {
  action: CircleAlert,
  testing: ClipboardCheck,
  ready: CheckCircle2,
  noData: CircleDashed,
};

interface SchematicPlacement {
  row: EnrichedPowerPlanEquipment;
  x: number;
  y: number;
  width: number;
  height: number;
}

type PowerPlanSearchSuggestion =
  | {
      kind: "pdm";
      key: string;
      pdmName: string;
    }
  | {
      kind: "equipment";
      key: string;
      pdmName: string | null;
      row: EnrichedPowerPlanEquipment;
    };

type SchematicEquipmentKind =
  | "pdu"
  | "cds"
  | "ats"
  | "transformer"
  | "ups"
  | "inverter"
  | "switchboard"
  | "panel"
  | "fire-system"
  | "cupp"
  | "other";

interface SchematicLayout {
  width: number;
  height: number;
  placements: SchematicPlacement[];
  roomLabels: Array<{ id: string; label: string; x: number; y: number }>;
  roomBoundaries: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  pdmRegions: Array<{
    id: string;
    label: string;
    equipmentCount: number;
    kind: "core" | "support" | "unassigned";
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

interface SchematicViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PanState {
  pointerId: number;
  clientX: number;
  clientY: number;
  equipmentAnnotationId: string | null;
  moved: boolean;
  viewport: SchematicViewport;
}

const SCHEMATIC_NODE_WIDTH = 168;
const SCHEMATIC_NODE_HEIGHT = 48;
const SCHEMATIC_AUX_NODE_WIDTH = 118;
const SCHEMATIC_AUX_NODE_HEIGHT = 32;
const SCHEMATIC_AREA_GAP = 24;
const SCHEMATIC_REGION_GAP = 16;

function isPrimaryEquipment(row: EnrichedPowerPlanEquipment): boolean {
  return /^(PDU|CDS)/i.test(row.annotation.label.trim());
}

function isCdsEquipment(row: EnrichedPowerPlanEquipment): boolean {
  return /^CDS/i.test(row.annotation.label.trim());
}

function isStandardAts(row: EnrichedPowerPlanEquipment): boolean {
  return /^ATS\d+-.*-\d+$/i.test(row.annotation.label.trim());
}

function isCoreEquipment(row: EnrichedPowerPlanEquipment): boolean {
  return isPrimaryEquipment(row) || isStandardAts(row);
}

function getSchematicEquipmentKind(label: string): SchematicEquipmentKind {
  const normalized = label.trim().toUpperCase();
  if (normalized.startsWith("PDU")) return "pdu";
  if (normalized.startsWith("CDS")) return "cds";
  if (normalized.startsWith("ATS")) return "ats";
  if (normalized.startsWith("TX-")) return "transformer";
  if (normalized.startsWith("UPS")) return "ups";
  if (normalized.startsWith("INV")) return "inverter";
  if (/^(MDB|MDS)/.test(normalized)) return "switchboard";
  if (/^(LP|DP|RP)/.test(normalized)) return "panel";
  if (normalized.startsWith("FSS")) return "fire-system";
  if (normalized.startsWith("CUPP")) return "cupp";
  return "other";
}

function snapCoordinate(value: number, interval: number): number {
  return Math.round(value / interval) * interval;
}

function getPdmAreaFamily(pdmName: string | null): string {
  const match = String(pdmName ?? "").match(/^IAD06-PDM-(E\d+-\d{3})(?:-|$)/i);
  return match?.[1]?.toUpperCase() ?? "Other";
}

function getPdmAreaName(pdmName: string | null): string {
  const normalized = String(pdmName ?? "").trim();
  const indexedArea = normalized.match(/^IAD06-PDM-(E\d+-\d{3})-(\d{2})(?:-|$)/i);
  if (indexedArea) {
    return `${indexedArea[1].toUpperCase()}-${indexedArea[2]}`;
  }
  const family = getPdmAreaFamily(normalized);
  return family;
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getPdmCombinationLayout(rows: EnrichedPowerPlanEquipment[]): SchematicLayout {
  if (rows.length === 0) {
    return {
      width: 1200,
      height: 680,
      placements: [],
      roomLabels: [],
      roomBoundaries: [],
      pdmRegions: [],
    };
  }

  const areaMap = new Map<string, EnrichedPowerPlanEquipment[]>();
  rows.forEach((row) => {
    const areaName = getPdmAreaName(row.pdmName);
    const areaRows = areaMap.get(areaName) ?? [];
    areaRows.push(row);
    areaMap.set(areaName, areaRows);
  });
  const areas = [...areaMap.entries()]
    .map(([label, areaRows]) => {
      const pdmMap = new Map<string, EnrichedPowerPlanEquipment[]>();
      areaRows.forEach((row) => {
        const pdmName = row.pdmName?.trim() || "Unassigned PDM";
        const pdmRows = pdmMap.get(pdmName) ?? [];
        pdmRows.push(row);
        pdmMap.set(pdmName, pdmRows);
      });
      const groups = [...pdmMap.entries()]
        .map(([groupLabel, groupRows]) => {
          const isCore = groupRows.some(isPrimaryEquipment);
          if (!isCore) {
            const columns = groupRows.length >= 4 ? 2 : 1;
            return {
              label: groupLabel,
              rows: groupRows,
              kind: "support" as const,
              width: 300,
              height:
                50 +
                Math.ceil(groupRows.length / columns) *
                  (SCHEMATIC_AUX_NODE_HEIGHT + 10) +
                16,
            };
          }

          const cdsCount = groupRows.filter(isCdsEquipment).length;
          const pairKeys = new Set(
            groupRows
              .filter((row) => !isCdsEquipment(row))
              .map((row) => row.annotation.label.match(/-(\d+)$/)?.[1] ?? row.annotation.label),
          );
          const pairTop = 72 + cdsCount * 56 + (cdsCount > 0 ? 10 : 0);
          const equipmentBottom =
            pairKeys.size > 0
              ? pairTop + (pairKeys.size - 1) * 58 + SCHEMATIC_NODE_HEIGHT / 2
              : 72 + cdsCount * 56;
          return {
            label: groupLabel,
            rows: groupRows,
            kind: "core" as const,
            width: 460,
            height: Math.max(190, equipmentBottom + 30),
          };
        })
        .sort((a, b) => {
          const kindDifference = Number(a.kind === "support") - Number(b.kind === "support");
          return kindDifference || naturalCompare(a.label, b.label);
        });
      const contentWidth = groups.reduce((total, group) => total + group.width, 0);
      const isShared = label === getPdmAreaFamily(areaRows[0]?.pdmName ?? null);
      return {
        label,
        groups,
        isShared,
        width: Math.max(620, contentWidth + Math.max(0, groups.length - 1) * SCHEMATIC_REGION_GAP + 80),
        height: 112 + Math.max(...groups.map((group) => group.height), 190) + 64,
      };
    })
    .sort((a, b) => Number(a.isShared) - Number(b.isShared) || naturalCompare(a.label, b.label));

  const numberedAreas = areas.filter((area) => !area.isShared);
  const sharedAreas = areas.filter((area) => area.isShared);
  const areaRows: typeof areas[] = [];
  for (let index = 0; index < numberedAreas.length; index += 2) {
    areaRows.push(numberedAreas.slice(index, index + 2));
  }
  sharedAreas.forEach((area) => areaRows.push([area]));
  const rowWidths = areaRows.map(
    (areaRow) =>
      areaRow.reduce((total, area) => total + area.width, 0) +
      Math.max(0, areaRow.length - 1) * SCHEMATIC_AREA_GAP,
  );
  const layoutWidth = Math.max(1200, ...rowWidths);
  const placements: SchematicPlacement[] = [];
  const roomLabels: SchematicLayout["roomLabels"] = [];
  const roomBoundaries: SchematicLayout["roomBoundaries"] = [];
  const pdmRegions: SchematicLayout["pdmRegions"] = [];
  let originY = 0;

  areaRows.forEach((areaRow, areaRowIndex) => {
    const rowHeight = Math.max(...areaRow.map((area) => area.height));
    let originX = (layoutWidth - rowWidths[areaRowIndex]) / 2;
    areaRow.forEach((area) => {
    roomLabels.push({
      id: `area:${area.label}`,
      label: area.label,
      x: originX + area.width / 2,
      y: originY + 68,
    });
    roomBoundaries.push({
      id: `area:${area.label}`,
      x: originX + 24,
      y: originY + 24,
      width: area.width - 48,
      height: area.height - 48,
    });
    let regionX = originX + 40;
    const regionDefinitions = area.groups.map((group) => {
      const region = {
        ...group,
        x: regionX,
        y: originY + 112,
      };
      regionX += group.width + SCHEMATIC_REGION_GAP;
      return region;
    });

    regionDefinitions.forEach((region, regionIndex) => {
      pdmRegions.push({
        id: `area:${area.label}:pdm:${regionIndex}:${region.label}`,
        label: region.label,
        equipmentCount: region.rows.length,
        kind: region.kind,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      });
      const sortedRows = [...region.rows].sort((a, b) =>
        naturalCompare(a.annotation.label, b.annotation.label),
      );

      if (region.kind === "core") {
        const cdsRows = sortedRows.filter(isCdsEquipment);
        const pairedRows = sortedRows.filter((row) => !isCdsEquipment(row));
        const pairMap = new Map<string, EnrichedPowerPlanEquipment[]>();
        pairedRows.forEach((row) => {
          const pairKey = row.annotation.label.match(/-(\d+)$/)?.[1] ?? row.annotation.label;
          const pairRows = pairMap.get(pairKey) ?? [];
          pairRows.push(row);
          pairMap.set(pairKey, pairRows);
        });
        const pairs = [...pairMap.entries()].sort((a, b) => naturalCompare(a[0], b[0]));
        const cdsStartY = region.y + 72;
        cdsRows.forEach((row, index) => {
          placements.push({
            row,
            x: region.x + region.width / 2,
            y: cdsStartY + index * 56,
            width: Math.min(SCHEMATIC_NODE_WIDTH * 2 + 22, region.width - 32),
            height: SCHEMATIC_NODE_HEIGHT,
          });
        });
        const pairTop = cdsRows.length > 0 ? cdsStartY + cdsRows.length * 56 + 10 : region.y + 72;
        const pairStep = pairs.length > 1 ? 58 : 0;
        pairs.forEach(([, pairRows], pairIndex) => {
          const pairY = pairs.length === 1 ? pairTop : pairTop + pairIndex * pairStep;
          const orderedPair = [...pairRows].sort((a, b) => {
            const reverse = region.label.endsWith("-R");
            const aPdu = /^PDU/i.test(a.annotation.label);
            const bPdu = /^PDU/i.test(b.annotation.label);
            return reverse ? Number(aPdu) - Number(bPdu) : Number(bPdu) - Number(aPdu);
          });
          orderedPair.forEach((row, columnIndex) => {
            placements.push({
              row,
              x:
                orderedPair.length === 1
                  ? region.x + region.width / 2
                  : region.x + region.width * (columnIndex === 0 ? 0.26 : 0.74),
              y: snapCoordinate(pairY, 2),
              width: SCHEMATIC_NODE_WIDTH,
              height: SCHEMATIC_NODE_HEIGHT,
            });
          });
        });
        return;
      }

      const availableWidth = region.width - 24;
      const availableHeight = region.height - 62;
      const columns = Math.max(
        1,
        Math.min(
          sortedRows.length >= 4 ? 2 : 1,
          Math.floor((availableWidth + 12) / (SCHEMATIC_AUX_NODE_WIDTH + 12)),
        ),
      );
      const horizontalGap = 12;
      const verticalGap = 10;
      const gridWidth =
        columns * SCHEMATIC_AUX_NODE_WIDTH + (columns - 1) * horizontalGap;
      const gridStartX = region.x + region.width / 2 - gridWidth / 2;
      const gridStartY = region.y + 50;
      sortedRows.forEach((row, index) => {
        const column = index % columns;
        const gridRow = Math.floor(index / columns);
        placements.push({
          row,
          x:
            gridStartX +
            SCHEMATIC_AUX_NODE_WIDTH / 2 +
            column * (SCHEMATIC_AUX_NODE_WIDTH + horizontalGap),
          y:
            gridStartY +
            SCHEMATIC_AUX_NODE_HEIGHT / 2 +
            gridRow * (SCHEMATIC_AUX_NODE_HEIGHT + verticalGap),
          width: SCHEMATIC_AUX_NODE_WIDTH,
          height: SCHEMATIC_AUX_NODE_HEIGHT,
        });
      });
    });
      originX += area.width + SCHEMATIC_AREA_GAP;
    });
    originY += rowHeight + SCHEMATIC_AREA_GAP;
  });

  return {
    width: layoutWidth,
    height: Math.max(420, originY - SCHEMATIC_AREA_GAP),
    placements,
    roomLabels,
    roomBoundaries,
    pdmRegions,
  };
}

function clampViewport(viewport: SchematicViewport, layout: SchematicLayout): SchematicViewport {
  const width = Math.min(layout.width * 2, viewport.width);
  const height = Math.min(layout.height * 2, viewport.height);
  return {
    x: viewport.x,
    y: viewport.y,
    width,
    height,
  };
}

function zoomViewport(
  viewport: SchematicViewport,
  layout: SchematicLayout,
  factor: number,
  anchorX = 0.5,
  anchorY = 0.5,
): SchematicViewport {
  const minWidth = Math.min(layout.width, 320);
  const minHeight = Math.min(layout.height, 220);
  let scale = factor;
  scale = Math.max(scale, minWidth / viewport.width, minHeight / viewport.height);
  scale = Math.min(
    scale,
    (layout.width * 2) / viewport.width,
    (layout.height * 2) / viewport.height,
  );
  const width = viewport.width * scale;
  const height = viewport.height * scale;
  return clampViewport(
    {
      x: viewport.x + (viewport.width - width) * anchorX,
      y: viewport.y + (viewport.height - height) * anchorY,
      width,
      height,
    },
    layout,
  );
}

function EquipmentGlyph({
  kind,
  x,
  color,
  compact,
}: {
  kind: SchematicEquipmentKind;
  x: number;
  color: string;
  compact: boolean;
}) {
  const scale = compact ? 0.72 : 0.86;
  const commonProps = {
    fill: "none",
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
  };

  return (
    <g aria-hidden="true" transform={`translate(${x} 0) scale(${scale})`}>
      {kind === "pdu" && (
        <g {...commonProps}>
          <rect height="16" rx="2" width="16" x="-8" y="-8" />
          <path d="M-3-5v10M3-5v10M-6 0h12" />
        </g>
      )}
      {(kind === "cds" || kind === "switchboard") && (
        <g {...commonProps}>
          <rect height="14" rx="1.5" width="18" x="-9" y="-7" />
          <path d="M-3-7V7M3-7V7M-7-3h2M-1-3h2M5-3h2" />
        </g>
      )}
      {kind === "ats" && (
        <g {...commonProps}>
          <circle cx="0" cy="0" r="8" />
          <path d="M-10 0h5M5 0h5M-4-3l4 4 4-6" />
        </g>
      )}
      {kind === "transformer" && (
        <g {...commonProps}>
          <circle cx="-3.5" cy="0" r="5.5" />
          <circle cx="3.5" cy="0" r="5.5" />
        </g>
      )}
      {kind === "ups" && (
        <g {...commonProps}>
          <rect height="14" rx="2" width="17" x="-9" y="-7" />
          <path d="M8-3h2v6H8M-5 0h4M-3-2v4M2 0h4" />
        </g>
      )}
      {kind === "inverter" && (
        <g {...commonProps}>
          <rect height="16" rx="2" width="18" x="-9" y="-8" />
          <path d="M-6 1c2-5 4-5 6 0s4 5 6 0" />
        </g>
      )}
      {kind === "panel" && (
        <g {...commonProps}>
          <rect height="16" rx="2" width="14" x="-7" y="-8" />
          <circle cx="-3" cy="-3" fill={color} r="0.8" />
          <circle cx="3" cy="-3" fill={color} r="0.8" />
          <circle cx="-3" cy="3" fill={color} r="0.8" />
          <circle cx="3" cy="3" fill={color} r="0.8" />
        </g>
      )}
      {kind === "fire-system" && (
        <g {...commonProps}>
          <path d="M1-9c1 4-2 5-1 8 1-2 3-3 4-5 3 3 5 6 4 9-1 4-4 6-8 6s-7-3-7-7c0-3 2-6 5-8 0 3 1 4 3 5" />
        </g>
      )}
      {kind === "cupp" && (
        <g {...commonProps}>
          <circle cx="0" cy="0" r="8" />
          <circle cx="0" cy="0" r="2" />
          <path d="M0-2v-5M2 1l5 3M-2 1l-5 3" />
        </g>
      )}
      {kind === "other" && (
        <g {...commonProps}>
          <path d="m0-8 8 8-8 8-8-8Z" />
          <circle cx="0" cy="0" fill={color} r="1.4" />
        </g>
      )}
    </g>
  );
}

function SchematicEquipment({
  placement,
  active,
  selected,
  onSelect,
}: {
  placement: SchematicPlacement;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { row, x, y, width, height } = placement;
  const colors = POWER_PLAN_STATUS_COLORS[row.status];
  const displayName = row.annotation.label;
  const compact = !isCoreEquipment(row);
  const equipmentKind = getSchematicEquipmentKind(displayName);
  const openIssueCount = row.openIssues.length;
  const markerRadius = compact ? 8 : 10;

  return (
    <g
      aria-label={`${row.equipmentId}: ${POWER_PLAN_STATUS_LABELS[row.status]}; ${openIssueCount} open issues`}
      className="cursor-pointer outline-none"
      data-annotation-id={row.annotation.annotation_id}
      data-equipment-marker="true"
      data-pdm-name={row.pdmName?.trim() || "Unassigned"}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      opacity={active ? 1 : 0.14}
      role="button"
      tabIndex={0}
      transform={`translate(${x} ${y})`}
    >
      <title>
        {row.equipmentId} / {POWER_PLAN_STATUS_LABELS[row.status]} / {row.openIssues.length} open issues
      </title>
      {selected && (
        <rect
          fill="none"
          height={height + 18}
          rx={12}
          stroke={colors.stroke}
          strokeDasharray="5 4"
          strokeWidth={3}
          width={width + 18}
          x={-width / 2 - 9}
          y={-height / 2 - 9}
        />
      )}
      <rect
        fill={colors.stroke}
        fillOpacity={0.18}
        height={height}
        rx={8}
        width={width}
        x={-width / 2 + 3}
        y={-height / 2 + 4}
      />
      <rect
        fill={colors.fill}
        height={height}
        rx={8}
        stroke={colors.stroke}
        strokeWidth={selected ? 4 : 2.5}
        width={width}
        x={-width / 2}
        y={-height / 2}
      />
      <path
        d={`M${-width / 2 + 10} ${-height / 2 + 6}H${width / 2 - 10}`}
        fill="none"
        opacity={0.78}
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <EquipmentGlyph
        color={colors.text}
        compact={compact}
        kind={equipmentKind}
        x={-width / 2 + (compact ? 12 : 16)}
      />
      <text
        fill={colors.text}
        fontSize={compact ? 9 : 12}
        fontWeight={700}
        letterSpacing={0}
        textAnchor="middle"
        x={compact ? 5 : 6}
        y={compact ? 3 : 4}
      >
        {displayName}
      </text>
      <g transform={`translate(${width / 2 - 2} ${-height / 2 + 2})`}>
        {openIssueCount > 0 && (
          <g aria-label={`${openIssueCount} open issues`} className="animate-equipment-failed">
            <circle fill="#b91c1c" r={markerRadius} stroke="white" strokeWidth={2} />
            <text fill="white" fontSize={compact ? 8 : 10} fontWeight={700} textAnchor="middle" y={3}>
              {openIssueCount}
            </text>
          </g>
        )}
        {row.notTestedCount > 0 && (
          <g aria-label={`${row.notTestedCount} tests remaining`} transform={`translate(${openIssueCount > 0 ? -23 : 0} 0)`}>
            <g className="animate-equipment-incomplete">
              <circle fill="#d97706" r={markerRadius} stroke="white" strokeWidth={2} />
              <text fill="white" fontSize={compact ? 8 : 10} fontWeight={700} textAnchor="middle" y={3}>
                {row.notTestedCount}
              </text>
            </g>
          </g>
        )}
        {openIssueCount === 0 && row.notTestedCount === 0 && row.status === "ready" && (
          <g>
            <circle fill={colors.stroke} r={8} stroke="white" strokeWidth={2} />
            <path d="m-4 0 3 3 5-6" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </g>
        )}
        {openIssueCount === 0 && row.status !== "ready" && row.failedCount === 0 && row.notTestedCount === 0 && (
          <g>
            <circle fill={colors.stroke} r={8} stroke="white" strokeWidth={2} />
            {row.status === "action" && (
              <text fill="white" fontSize={compact ? 9 : 11} fontWeight={700} textAnchor="middle" y={3.5}>!</text>
            )}
          </g>
        )}
      </g>
    </g>
  );
}

function issueTone(issue: CaseIssue): "danger" | "success" | "muted" {
  if (isOpenIssue(issue)) {
    return "danger";
  }
  return issue.status ? "success" : "muted";
}

function testItemTone(
  item: EpsTestItemRecord,
  netaComplete: boolean,
): "danger" | "success" | "teal" | "warning" | "muted" {
  if (isPowerPlanWaivedItem(item, netaComplete)) {
    return "success";
  }
  const status = String(item.item_status ?? "").toLowerCase();
  if (status.startsWith("failed")) {
    return "danger";
  }
  if (status.startsWith("passed")) {
    return "success";
  }
  if (status.startsWith("fixed")) return "teal";
  if (status === "not tested" || status === "incomplete") {
    return "warning";
  }
  return "muted";
}

function testItemStatusLabel(item: EpsTestItemRecord, netaComplete: boolean): string {
  if (isPowerPlanWaivedItem(item, netaComplete)) {
    return "Not Required";
  }
  return getEpsTestItemStatusLabel(item.item_status);
}

function EquipmentDetail({
  row,
  onBack,
  onSelectIssue,
}: {
  row: EnrichedPowerPlanEquipment;
  onBack: () => void;
  onSelectIssue: (issue: CaseIssue) => void;
}) {
  const netaComplete = row.equipment?.neta_complete === true;
  const sortedItems = useMemo(
    () =>
      [...row.testItems].sort((a, b) => {
        const rank = (item: EpsTestItemRecord) => {
          if (isPowerPlanWaivedItem(item, netaComplete)) return 3;
          const status = String(item.item_status ?? "").toLowerCase();
          if (status.startsWith("failed")) return 0;
          if (status === "not tested" || status === "incomplete") return 1;
          if (status.startsWith("passed") || status.startsWith("fixed")) return 2;
          return 4;
        };
        return (
          rank(a) - rank(b) ||
          String(a.equipment_name ?? "").localeCompare(String(b.equipment_name ?? ""))
        );
      }),
    [netaComplete, row.testItems],
  );
  const sortedIssues = useMemo(
    () =>
      [...row.issues].sort(
        (a, b) => Number(isOpenIssue(b)) - Number(isOpenIssue(a)),
      ),
    [row.issues],
  );
  const totalItems = row.testItems.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-4">
        <button
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          PDM equipment
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold">{row.equipmentId}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{row.pdmName ?? "No PDM association"}</p>
          </div>
          <StatusBadge tone={statusTone[row.status]}>
            {POWER_PLAN_STATUS_LABELS[row.status]}
          </StatusBadge>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [overflow-anchor:none] [scrollbar-gutter:stable]">
        <section>
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Current condition</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-emerald-50 p-2.5">
              <div className="text-lg font-semibold text-emerald-700">{row.passedCount}</div>
              <div className="text-[11px] text-emerald-800">Passed</div>
            </div>
            <div className="rounded-md border bg-red-50 p-2.5">
              <div className="text-lg font-semibold text-red-700">{row.failedCount}</div>
              <div className="text-[11px] text-red-800">Failed</div>
            </div>
            <div className="rounded-md border bg-amber-50 p-2.5">
              <div className="text-lg font-semibold text-amber-700">{row.notTestedCount}</div>
              <div className="text-[11px] text-amber-800">Not tested</div>
            </div>
            <div className="rounded-md border bg-teal-50 p-2.5">
              <div className="text-lg font-semibold text-teal-700">{row.waivedCount}</div>
              <div className="text-[11px] text-teal-800">Not required</div>
            </div>
          </div>
          {totalItems > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="flex h-full">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(row.passedCount / totalItems) * 100}%` }}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(row.failedCount / totalItems) * 100}%` }}
                />
                <div
                  className="bg-amber-400"
                  style={{ width: `${(row.notTestedCount / totalItems) * 100}%` }}
                />
                <div
                  className="bg-teal-500"
                  style={{ width: `${(row.waivedCount / totalItems) * 100}%` }}
                />
              </div>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Infralink NETA</dt>
              <dd className="mt-0.5 font-medium">
                {netaComplete ? "Complete" : "Incomplete"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Open issues</dt>
              <dd className={cn("mt-0.5 font-medium", row.openIssues.length > 0 && "text-red-700")}>
                {row.openIssues.length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Equipment status</dt>
              <dd className="mt-0.5 font-medium">{String(row.equipment?.status ?? "--")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tracker items</dt>
              <dd className="mt-0.5 font-medium">{totalItems}</dd>
            </div>
          </dl>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Issues</h3>
            <span className="text-xs text-muted-foreground">{row.issues.length} total</span>
          </div>
          <div className="mt-2 space-y-2">
            {sortedIssues.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No linked Infralink issues.
              </p>
            ) : (
              sortedIssues.map((issue, index) => (
                <button
                  className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted"
                  key={`${issue.case_id}-${index}`}
                  onClick={() => onSelectIssue(issue)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold">{issue.case_id ?? "Case"}</span>
                    <StatusBadge tone={issueTone(issue)}>{String(issue.status ?? "Unknown")}</StatusBadge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {issue.summary || "No summary"}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">EPS test items</h3>
            <span className="text-xs text-muted-foreground">{totalItems} total</span>
          </div>
          <div className="mt-2 space-y-2">
            {sortedItems.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No linked EPS tracker items.
              </p>
            ) : (
              sortedItems.map((item, index) => (
                <article
                  className="rounded-md border bg-background p-3"
                  key={`${item.equipment_key}-${item.tracker_row}-${index}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-medium">
                      {item.equipment_name ?? "Unnamed test item"}
                    </span>
                    <StatusBadge tone={testItemTone(item, netaComplete)}>
                      {testItemStatusLabel(item, netaComplete)}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{item.tracker_type ?? "Unknown tracker"}</span>
                    {item.date_tested && <span>{item.date_tested}</span>}
                  </div>
                  {(item.follow_up_req || item.comments) && (
                    <p
                      className={cn(
                        "mt-2 border-l-2 pl-2 text-[11px] leading-4 text-muted-foreground",
                        isPowerPlanWaivedItem(item, netaComplete)
                          ? "border-teal-400"
                          : "border-amber-300",
                      )}
                    >
                      {[item.follow_up_req, item.comments].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EquipmentQueue({
  rows,
  onSelect,
}: {
  rows: EnrichedPowerPlanEquipment[];
  onSelect: (row: EnrichedPowerPlanEquipment) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">PDM Equipment</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Equipment in the selected area family.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 [overflow-anchor:none] [scrollbar-gutter:stable]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No equipment matches the current filter.</p>
        ) : (
          rows.map((row) => {
            const Icon = statusIcon[row.status];
            return (
              <button
                className="flex w-full items-start gap-3 rounded-md border-b px-3 py-3 text-left transition-colors hover:bg-muted"
                key={row.annotation.annotation_id}
                onClick={() => onSelect(row)}
                type="button"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: POWER_PLAN_STATUS_COLORS[row.status].fill,
                    borderColor: POWER_PLAN_STATUS_COLORS[row.status].stroke,
                    color: POWER_PLAN_STATUS_COLORS[row.status].text,
                  }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{row.equipmentId}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {row.notTestedCount} not tested
                    {row.waivedCount > 0 ? ` · ${row.waivedCount} not required` : ""} · {row.openIssues.length} open issues
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function PowerPlanPage({ data }: PowerPlanPageProps) {
  const allRows = useMemo(() => enrichPdmSchematicEquipment(data), [data]);
  const areaFamilies = useMemo(
    () =>
      [...new Set(allRows.map((row) => getPdmAreaFamily(row.pdmName)))].sort((a, b) =>
        naturalCompare(a, b),
      ),
    [allRows],
  );
  const [areaFamily, setAreaFamily] = useState(() =>
    areaFamilies.includes("E6-110") ? "E6-110" : areaFamilies[0] ?? "",
  );
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PowerPlanEquipmentStatus | "">("");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<EnrichedIssue | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const pendingSearchSelectionRef = useRef<string | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const rows = useMemo(
    () => allRows.filter((row) => getPdmAreaFamily(row.pdmName) === areaFamily),
    [allRows, areaFamily],
  );
  const enrichedIssues = useMemo(
    () => enrichIssuesWithPdmContext(data.cases, data.pdms, data.equipment),
    [data.cases, data.equipment, data.pdms],
  );
  const layout = useMemo(() => getPdmCombinationLayout(rows), [rows]);
  const [viewport, setViewport] = useState<SchematicViewport>({
    x: 0,
    y: 0,
    width: layout.width,
    height: layout.height,
  });
  const selectedRow =
    rows.find((row) => row.annotation.annotation_id === selectedAnnotationId) ?? null;
  const normalizedSearch = search.trim();
  const globalSearchMatches = useMemo(() => {
    if (!normalizedSearch) return [];
    const score = (row: EnrichedPowerPlanEquipment) => {
      const values = [row.equipmentId, row.annotation.label, row.pdmName];
      return getSearchMatchScore(
        [row.equipmentId, row.annotation.label],
        values,
        normalizedSearch,
      );
    };
    return allRows
      .filter((row) =>
        matchesSearchQuery(
          [row.equipmentId, row.annotation.label, row.pdmName],
          normalizedSearch,
        ),
      )
      .sort(
        (a, b) =>
          score(a) - score(b) ||
          naturalCompare(a.equipmentId, b.equipmentId) ||
          naturalCompare(a.pdmName ?? "", b.pdmName ?? ""),
      );
  }, [allRows, normalizedSearch]);
  const globalPdmMatches = useMemo(() => {
    if (!normalizedSearch) return [];

    return [
      ...new Set(
        allRows
          .map((row) => row.pdmName)
          .filter((pdmName): pdmName is string => Boolean(pdmName)),
      ),
    ]
      .filter((pdmName) => matchesSearchQuery([pdmName], normalizedSearch))
      .sort(naturalCompare);
  }, [allRows, normalizedSearch]);
  const globalSearchSuggestions = useMemo<PowerPlanSearchSuggestion[]>(() => {
    if (globalPdmMatches.length > 0) {
      return globalPdmMatches.slice(0, 10).map((pdmName) => ({
        kind: "pdm",
        key: `pdm-${pdmName}`,
        pdmName,
      }));
    }

    return globalSearchMatches.slice(0, 10).map((row) => ({
      kind: "equipment",
      key: row.annotation.annotation_id,
      pdmName: row.pdmName,
      row,
    }));
  }, [globalPdmMatches, globalSearchMatches]);
  const globalSearchResultCount =
    globalPdmMatches.length > 0 ? globalPdmMatches.length : globalSearchMatches.length;
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!statusFilter || row.status === statusFilter) &&
          (!normalizedSearch ||
            matchesSearchQuery(
              [row.equipmentId, row.annotation.label, row.pdmName],
              normalizedSearch,
            )),
      ),
    [normalizedSearch, rows, statusFilter],
  );
  const activeAnnotationIds = useMemo(
    () => new Set(filteredRows.map((row) => row.annotation.annotation_id)),
    [filteredRows],
  );

  useEffect(() => {
    setViewport({ x: 0, y: 0, width: layout.width, height: layout.height });
    const pendingSelection = pendingSearchSelectionRef.current;
    setSelectedAnnotationId(
      pendingSelection &&
        allRows.some(
          (row) =>
            row.annotation.annotation_id === pendingSelection &&
            getPdmAreaFamily(row.pdmName) === areaFamily,
        )
        ? pendingSelection
        : null,
    );
    pendingSearchSelectionRef.current = null;
  }, [allRows, areaFamily, layout.height, layout.width]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = svg.getBoundingClientRect();
      const anchorX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const anchorY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      setViewport((current) =>
        zoomViewport(current, layout, event.deltaY < 0 ? 0.86 : 1.16, anchorX, anchorY),
      );
    };

    svg.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleCanvasWheel);
  }, [layout]);

  if (allRows.length === 0) {
    return (
      <EmptyState
        title="No PDM equipment data found."
        description="Run the ETL to generate pdms.json, then reload the dashboard."
      />
    );
  }

  const counts = rows.reduce<Record<PowerPlanEquipmentStatus, number>>(
    (result, row) => {
      result[row.status] += 1;
      return result;
    },
    { action: 0, testing: 0, ready: 0, noData: 0 },
  );
  function selectRow(row: EnrichedPowerPlanEquipment) {
    setSelectedAnnotationId(row.annotation.annotation_id);
  }

  function selectGlobalSearchResult(suggestion: PowerPlanSearchSuggestion) {
    const targetFamily = getPdmAreaFamily(suggestion.pdmName);
    setSearch(suggestion.kind === "pdm" ? suggestion.pdmName : suggestion.row.equipmentId);
    setSearchOpen(false);
    setActiveSearchIndex(0);
    if (suggestion.kind === "pdm") {
      setSelectedAnnotationId(null);
      if (targetFamily !== areaFamily) {
        setAreaFamily(targetFamily);
      }
      return;
    }
    if (targetFamily !== areaFamily) {
      pendingSearchSelectionRef.current = suggestion.row.annotation.annotation_id;
      setAreaFamily(targetFamily);
      return;
    }
    selectRow(suggestion.row);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((current) =>
        Math.min(current + 1, Math.max(0, globalSearchSuggestions.length - 1)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && globalSearchSuggestions.length > 0) {
      event.preventDefault();
      selectGlobalSearchResult(
        globalSearchSuggestions[Math.min(activeSearchIndex, globalSearchSuggestions.length - 1)],
      );
    }
  }

  function selectIssue(issue: CaseIssue) {
    const sourceIndex = data.cases.indexOf(issue);
    setSelectedIssue(sourceIndex >= 0 ? enrichedIssues[sourceIndex] ?? null : null);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const equipmentMarker = (event.target as Element).closest('[data-equipment-marker="true"]');
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      equipmentAnnotationId: equipmentMarker?.getAttribute("data-annotation-id") ?? null,
      moved: false,
      viewport,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!pan || pan.pointerId !== event.pointerId || !bounds) {
      return;
    }
    const movement = Math.hypot(event.clientX - pan.clientX, event.clientY - pan.clientY);
    if (!pan.moved && movement < 4) return;
    if (!pan.moved) {
      pan.moved = true;
    }
    event.preventDefault();
    const deltaX = ((event.clientX - pan.clientX) / bounds.width) * pan.viewport.width;
    const deltaY = ((event.clientY - pan.clientY) / bounds.height) * pan.viewport.height;
    setViewport(
      clampViewport(
        {
          ...pan.viewport,
          x: pan.viewport.x - deltaX,
          y: pan.viewport.y - deltaY,
        },
        layout,
      ),
    );
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (pan?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    if (!pan.moved && pan.equipmentAnnotationId) {
      const row = rows.find(
        (candidate) => candidate.annotation.annotation_id === pan.equipmentAnnotationId,
      );
      if (row) selectRow(row);
      return;
    }
    if (pan.moved) {
      suppressCanvasClickRef.current = true;
      window.setTimeout(() => {
        suppressCanvasClickRef.current = false;
      }, 0);
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      <section className="relative z-30 rounded-md border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-base font-semibold">PDM Equipment Layout</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Equipment grouped by numbered area and PDM association.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {areaFamilies.length > 1 && (
              <select
                aria-label="Area family"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                onChange={(event) => setAreaFamily(event.target.value)}
                value={areaFamily}
              >
                {areaFamilies.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            )}
            <div
              className="relative w-full sm:w-96"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setSearchOpen(false);
                }
              }}
            >
              <label className="sr-only" htmlFor="power-plan-global-search">
                Search all equipment
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                aria-autocomplete="list"
                aria-controls="power-plan-search-results"
                aria-expanded={searchOpen && Boolean(normalizedSearch)}
                className="h-9 w-full rounded-md border bg-background pl-9 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
                id="power-plan-global-search"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                  setActiveSearchIndex(0);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search all equipment or PDMs"
                role="combobox"
                value={search}
              />
              {search && (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                    setActiveSearchIndex(0);
                  }}
                  title="Clear search"
                  type="button"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {searchOpen && normalizedSearch && (
                <div
                  className="absolute right-0 top-11 z-50 isolate max-h-80 w-full min-w-[360px] overflow-y-auto rounded-md border bg-card p-1 shadow-lg"
                  id="power-plan-search-results"
                  role="listbox"
                >
                  <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
                    <span>All equipment groups</span>
                    <span>{globalSearchResultCount} matches</span>
                  </div>
                  {globalSearchSuggestions.length > 0 ? (
                    globalSearchSuggestions.map((suggestion, index) => {
                      const targetFamily = getPdmAreaFamily(suggestion.pdmName);
                      return (
                        <button
                          aria-selected={index === activeSearchIndex}
                          className={cn(
                            "flex w-full items-start gap-3 rounded px-2 py-2 text-left hover:bg-muted",
                            index === activeSearchIndex && "bg-muted",
                          )}
                          key={suggestion.key}
                          onClick={() => selectGlobalSearchResult(suggestion)}
                          onMouseEnter={() => setActiveSearchIndex(index)}
                          role="option"
                          type="button"
                        >
                          <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {suggestion.kind === "pdm"
                                ? suggestion.pdmName
                                : suggestion.row.equipmentId}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {suggestion.kind === "pdm"
                                ? "PDM equipment group"
                                : suggestion.pdmName || "Unassigned PDM"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                              targetFamily === areaFamily
                                ? "border-slate-200 bg-slate-50 text-slate-600"
                                : "border-blue-200 bg-blue-50 text-blue-700",
                            )}
                          >
                            {targetFamily === areaFamily ? targetFamily : `Switch to ${targetFamily}`}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No equipment or PDM matches found.
                    </div>
                  )}
                  {globalSearchResultCount > globalSearchSuggestions.length && (
                    <div className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
                      Refine the search to narrow the remaining results.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-5 sm:divide-y-0">
          <button
            className={cn("px-4 py-3 text-left hover:bg-muted", !statusFilter && "bg-muted")}
            onClick={() => setStatusFilter("")}
            type="button"
          >
            <div className="text-xl font-semibold">{rows.length}</div>
            <div className="text-xs text-muted-foreground">Equipment</div>
          </button>
          {(Object.keys(POWER_PLAN_STATUS_LABELS) as PowerPlanEquipmentStatus[]).map((status) => (
            <button
              className={cn("px-4 py-3 text-left hover:bg-muted", statusFilter === status && "bg-muted")}
              key={status}
              onClick={() => setStatusFilter((current) => (current === status ? "" : status))}
              type="button"
            >
              <div className="text-xl font-semibold" style={{ color: POWER_PLAN_STATUS_COLORS[status].text }}>
                {counts[status]}
              </div>
              <div className="text-xs text-muted-foreground">{POWER_PLAN_STATUS_LABELS[status]}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid min-h-[720px] gap-4 [overflow-anchor:none] xl:h-[780px] xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-md border bg-card xl:h-full">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{areaFamily}</span>
              <span>{layout.roomBoundaries.length} area groups</span>
              <span>{filteredRows.length} visible assets</span>
            </div>
            <div className="flex min-w-fit flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              {(Object.keys(POWER_PLAN_STATUS_LABELS) as PowerPlanEquipmentStatus[]).map((status) => (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" key={status}>
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 rounded-[3px] border"
                    style={{
                      backgroundColor: POWER_PLAN_STATUS_COLORS[status].fill,
                      borderColor: POWER_PLAN_STATUS_COLORS[status].stroke,
                    }}
                  />
                  {POWER_PLAN_STATUS_LABELS[status]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-700 px-1 text-[9px] font-bold text-white">
                  #
                </span>
                Open Issues
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[9px] font-bold text-white">
                  n
                </span>
                Tests Remaining
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="min-w-12 text-center text-[11px] font-medium text-muted-foreground">
                {Math.round((layout.width / viewport.width) * 100)}%
              </span>
              <button
                aria-label="Zoom out"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                onClick={() => setViewport((current) => zoomViewport(current, layout, 1.2))}
                title="Zoom out"
                type="button"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                aria-label="Zoom in"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                onClick={() => setViewport((current) => zoomViewport(current, layout, 0.82))}
                title="Zoom in"
                type="button"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                aria-label="Reset view"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                onClick={() => setViewport({ x: 0, y: 0, width: layout.width, height: layout.height })}
                title="Reset view"
                type="button"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="min-h-[620px] flex-1 overflow-hidden bg-slate-100 p-3">
            <svg
              aria-label="SVG equipment location schematic"
              className="h-full min-h-[620px] w-full cursor-grab select-none active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              preserveAspectRatio="xMidYMid meet"
              ref={svgRef}
              role="img"
              shapeRendering="geometricPrecision"
              style={{ touchAction: "none" }}
              viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            >
              <defs>
                <pattern height="40" id="engineering-grid" patternUnits="userSpaceOnUse" width="40">
                  <path d="M40 0H0V40" fill="none" opacity="0.72" stroke="#dbe4ee" strokeWidth="1" />
                </pattern>
              </defs>
              <rect fill="#f8fafc" height={layout.height} width={layout.width} />
              <rect fill="url(#engineering-grid)" height={layout.height} width={layout.width} />

              {layout.roomBoundaries.map((boundary) => (
                <g key={boundary.id}>
                  <rect
                    fill="#64748b"
                    fillOpacity={0.11}
                    height={boundary.height}
                    rx={10}
                    width={boundary.width}
                    x={boundary.x + 5}
                    y={boundary.y + 7}
                  />
                  <rect
                    fill="#ffffff"
                    fillOpacity={0.82}
                    height={boundary.height}
                    rx={10}
                    stroke="#64748b"
                    strokeWidth={2}
                    width={boundary.width}
                    x={boundary.x}
                    y={boundary.y}
                  />
                </g>
              ))}

              {layout.pdmRegions.map((region) => {
                const palette =
                  region.kind === "unassigned"
                    ? { fill: "#fffbeb", stroke: "#d97706", text: "#92400e" }
                    : region.kind === "core"
                      ? { fill: "#f8fafc", stroke: "#64748b", text: "#1e3a5f" }
                      : { fill: "#f1f5f9", stroke: "#94a3b8", text: "#334155" };
                return (
                  <g data-pdm-region={region.label} key={region.id}>
                    <title>{`${region.label}: ${region.equipmentCount} equipment`}</title>
                    <rect
                      fill={palette.stroke}
                      fillOpacity={0.12}
                      height={region.height}
                      rx={8}
                      width={region.width}
                      x={region.x + 4}
                      y={region.y + 6}
                    />
                    <rect
                      fill={palette.fill}
                      fillOpacity={0.94}
                      height={region.height}
                      rx={8}
                      stroke={palette.stroke}
                      strokeDasharray={region.kind === "unassigned" ? "6 4" : undefined}
                      strokeWidth={1.5}
                      width={region.width}
                      x={region.x}
                      y={region.y}
                    />
                    <line
                      strokeLinecap="round"
                      stroke={palette.stroke}
                      strokeWidth={3}
                      x1={region.x + 8}
                      x2={region.x + region.width - 8}
                      y1={region.y}
                      y2={region.y}
                    />
                    <text
                      fill={palette.text}
                      fontSize={region.kind === "core" ? 15 : 12}
                      fontWeight="700"
                      letterSpacing={0}
                      x={region.x + 12}
                      y={region.y + 24}
                    >
                      {region.label}
                    </text>
                    <text
                      fill={palette.text}
                      fontSize="12"
                      fontWeight="700"
                      letterSpacing={0}
                      textAnchor="end"
                      x={region.x + region.width - 12}
                      y={region.y + 24}
                    >
                      {region.equipmentCount}
                    </text>
                  </g>
                );
              })}

              {layout.roomLabels.map((room) => (
                <g key={room.id}>
                  <text
                    fill="#1e3a5f"
                    fontSize="24"
                    fontWeight="700"
                    letterSpacing={0}
                    textAnchor="middle"
                    x={room.x}
                    y={room.y}
                  >
                    {room.label}
                  </text>
                  <line
                    stroke="#64748b"
                    strokeWidth="2"
                    x1={room.x - 90}
                    x2={room.x + 90}
                    y1={room.y + 13}
                    y2={room.y + 13}
                  />
                </g>
              ))}

              {layout.placements.map((placement) => (
                <SchematicEquipment
                  active={activeAnnotationIds.has(placement.row.annotation.annotation_id)}
                  key={placement.row.annotation.annotation_id}
                  onSelect={() => {
                    if (!suppressCanvasClickRef.current) selectRow(placement.row);
                  }}
                  placement={placement}
                  selected={selectedAnnotationId === placement.row.annotation.annotation_id}
                />
              ))}
            </svg>
          </div>
        </section>

        <aside className="flex min-h-0 max-h-[780px] flex-col overflow-hidden rounded-md border bg-card [overflow-anchor:none] xl:h-full xl:max-h-none">
          {selectedRow ? (
            <EquipmentDetail
              onBack={() => setSelectedAnnotationId(null)}
              onSelectIssue={selectIssue}
              row={selectedRow}
            />
          ) : (
            <EquipmentQueue rows={filteredRows} onSelect={selectRow} />
          )}
        </aside>
      </div>
      <IssueDetailDrawer issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
    </div>
  );
}
