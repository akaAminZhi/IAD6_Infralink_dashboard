import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Cable,
  CircleDot,
  FileText,
  Maximize2,
  MessageCircle,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "../components/common/EmptyState";
import { IssueDetailDrawer } from "../components/issues/IssueDetailDrawer";
import { IssueStatusBadge } from "../components/issues/IssueStatusBadge";
import type {
  DashboardData,
  PowerPlanAnnotation as BasePowerPlanAnnotation,
  PowerPlanPageRecord,
  PowerPlanRect,
} from "../types/data";
import type { MvEquipmentComment } from "../types/automation";
import { enrichPowerPlanEquipment, POWER_PLAN_STATUS_COLORS } from "../utils/powerPlanUtils";
import { formatDateTime } from "../utils/formatters";
import { requiresEquipmentTestTracking } from "../utils/equipmentTrackingUtils";
import {
  enrichIssuesWithPdmContext,
  isOpenIssue,
  type EnrichedIssue,
} from "../utils/issueUtils";
import {
  addMvEquipmentComment,
  deleteMvEquipmentComment,
  getMvEquipmentComments,
} from "../utils/automationApi";

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

interface PowerPlanAnnotation extends BasePowerPlanAnnotation {
  netaComplete?: boolean;
  netaCompletedAt?: string | null;
  trackingRequired?: boolean;
  failedCount?: number;
}

interface AtpPreview {
  fileName: string;
  url: string;
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

type MvStatusHighlight =
  | "netaComplete"
  | "dailyPassedPendingNeta"
  | "failed"
  | "cableTestedAndUpdated"
  | "cableUpdatePending"
  | "shipToSite"
  | "installationComplete"
  | "neutral";

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
  fill: "#fef3c7",
  stroke: "#d97706",
  text: "#92400e",
};

const TESTED_PALETTE: MvStatusPalette = {
  fill: "#dcfce7",
  stroke: "#16a34a",
  text: "#166534",
};

const DAILY_PASSED_PENDING_NETA_PALETTE: MvStatusPalette = {
  fill: "#f0fdf4",
  stroke: "#86efac",
  text: "#166534",
};

const CABLE_UPDATE_PENDING_PALETTE: MvStatusPalette = {
  fill: "#dbeafe",
  stroke: "#2563eb",
  text: "#1e3a8a",
};

const FAILED_PALETTE: MvStatusPalette = {
  fill: "#ef4444",
  stroke: "#dc2626",
  text: "#ffffff",
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function isMvDailyTestPassed(annotation: PowerPlanAnnotation): boolean {
  return ["tested_and_passed", "retested_and_passed"].includes(
    String(annotation.mv_daily_test_status ?? ""),
  );
}

function isMvDailyTestFailed(annotation: PowerPlanAnnotation): boolean {
  return annotation.mv_daily_test_status === "failed";
}

function isCableTestedAndInfralinkUpdated(annotation: PowerPlanAnnotation): boolean {
  return (
    isConnection(annotation) &&
    normalizeStatus(annotation.system_element_status) === "L3: PRE FUNC TESTING & STARTUP"
  );
}

function isRequiredAtpMissing(annotation: PowerPlanAnnotation): boolean {
  return annotation.feeder_cable_atp_status === "missing_required";
}

function getSystemStatusHighlight(annotation: PowerPlanAnnotation): MvStatusHighlight {
  if (annotation.netaComplete) return "netaComplete";
  const status = normalizeStatus(annotation.system_element_status);
  if (isCableTestedAndInfralinkUpdated(annotation)) return "cableTestedAndUpdated";
  if (status.includes("SHIP TO SITE")) return "shipToSite";
  if (
    (isConnection(annotation) || isTermination(annotation)) &&
    status === "INSTALLATION COMPLETE"
  ) {
    return "installationComplete";
  }
  return "neutral";
}

function getStatusHighlight(annotation: PowerPlanAnnotation): MvStatusHighlight {
  if (annotation.netaComplete) return "netaComplete";
  if (isMvDailyTestFailed(annotation)) return "failed";
  if (isCableTestedAndInfralinkUpdated(annotation)) return "cableTestedAndUpdated";
  if (isConnection(annotation) && isMvDailyTestPassed(annotation)) {
    return "cableUpdatePending";
  }
  if (!isConnection(annotation) && isMvDailyTestPassed(annotation)) {
    return "dailyPassedPendingNeta";
  }
  return getSystemStatusHighlight(annotation);
}

function paletteForHighlight(highlight: MvStatusHighlight): MvStatusPalette {
  if (highlight === "netaComplete") return POWER_PLAN_STATUS_COLORS.ready;
  if (highlight === "dailyPassedPendingNeta") return DAILY_PASSED_PENDING_NETA_PALETTE;
  if (highlight === "failed") return FAILED_PALETTE;
  if (highlight === "cableTestedAndUpdated") return TESTED_PALETTE;
  if (highlight === "cableUpdatePending") return CABLE_UPDATE_PENDING_PALETTE;
  if (highlight === "shipToSite") return SHIP_TO_SITE_PALETTE;
  if (highlight === "installationComplete") return INSTALLATION_COMPLETE_PALETTE;
  return NEUTRAL_PALETTE;
}

function getAnnotationPalette(annotation: PowerPlanAnnotation): MvStatusPalette {
  return paletteForHighlight(getStatusHighlight(annotation));
}

function getSystemElementPalette(annotation: PowerPlanAnnotation): MvStatusPalette {
  return paletteForHighlight(getSystemStatusHighlight(annotation));
}

function mvTestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    tested_and_passed: "Tested And Passed",
    partially_tested: "Partially Tested",
    failed: "Failed",
    retested_and_passed: "Retested And Passed",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function mvTestStatusTone(status: string): string {
  if (["tested_and_passed", "retested_and_passed"].includes(status)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (status === "failed") return "border-red-300 bg-red-50 text-red-800";
  return "border-amber-300 bg-amber-50 text-amber-900";
}

function cableReadinessLabel(annotation: PowerPlanAnnotation): string {
  if (isMvDailyTestFailed(annotation)) return "Test Failed";
  if (isCableTestedAndInfralinkUpdated(annotation)) {
    return "Tested + Infralink Updated";
  }
  if (isMvDailyTestPassed(annotation)) return "Tested - Infralink Update Pending";
  if (annotation.mv_daily_test_status === "partially_tested") return "Partially Tested";
  return "Testing Not Confirmed";
}

function cableReadinessTone(annotation: PowerPlanAnnotation): string {
  if (isMvDailyTestFailed(annotation)) return "border-red-300 bg-red-50 text-red-800";
  if (isCableTestedAndInfralinkUpdated(annotation)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (isMvDailyTestPassed(annotation)) return "border-blue-300 bg-blue-50 text-blue-800";
  if (annotation.mv_daily_test_status === "partially_tested") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function formatMvTestDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
}

function formatCommentTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
}

function normalizeEquipmentReference(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^IAD06-/, "");
}

function equipmentReferenceKeys(...values: unknown[]): Set<string> {
  const keys = new Set<string>();
  values.forEach((value) => {
    String(value ?? "")
      .split(/[\r\n,;|]+/)
      .forEach((part) => {
        const key = normalizeEquipmentReference(part);
        if (key) keys.add(key);
      });
  });
  return keys;
}

function getRelatedIssues(
  annotation: PowerPlanAnnotation | null,
  issues: EnrichedIssue[],
): EnrichedIssue[] {
  if (!annotation) return [];
  const annotationKeys = equipmentReferenceKeys(
    annotation.label,
    annotation.normalized_equipment_key,
    annotation.matched_equipment_id,
  );
  if (annotationKeys.size === 0) return [];

  return issues
    .filter((issue) => {
      const issueKeys = equipmentReferenceKeys(issue.equipment_id, issue.system_element_raw);
      return [...issueKeys].some((key) => annotationKeys.has(key));
    })
    .sort(
      (left, right) =>
        Number(isOpenIssue(right)) - Number(isOpenIssue(left)) ||
        String(left.case_id ?? "").localeCompare(String(right.case_id ?? ""), undefined, {
          numeric: true,
        }),
    );
}

interface CommentIndicatorPosition {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
}

function commentIndicatorPosition(annotation: PowerPlanAnnotation): CommentIndicatorPosition {
  if (isConnection(annotation)) {
    return {
      anchorX: annotation.center.x,
      anchorY: annotation.center.y,
      x: annotation.center.x + 42,
      y: annotation.center.y - 42,
    };
  }
  if (isTermination(annotation)) {
    return {
      anchorX: annotation.center.x,
      anchorY: annotation.center.y,
      x: annotation.center.x + 46,
      y: annotation.center.y + 8,
    };
  }
  const anchorY = annotation.rect.y + Math.min(annotation.rect.height * 0.28, 28);
  return {
    anchorX: annotation.rect.x + annotation.rect.width,
    anchorY,
    x: annotation.rect.x + annotation.rect.width + 30,
    y: anchorY,
  };
}

function MvCommentIndicator({
  annotation,
  commentCount,
  scale,
  onSelect,
}: {
  annotation: PowerPlanAnnotation;
  commentCount: number;
  scale: number;
  onSelect: () => void;
}) {
  const position = commentIndicatorPosition(annotation);
  return (
    <g
      aria-label={`View ${commentCount} comment${commentCount === 1 ? "" : "s"} for ${annotation.label}`}
      className="cursor-pointer outline-none"
      data-mv-comment-indicator="true"
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
      <title>{`${commentCount} comment${commentCount === 1 ? "" : "s"}`}</title>
      <line
        stroke="#8b5cf6"
        strokeDasharray="4 4"
        strokeLinecap="round"
        strokeWidth="2"
        x1={position.anchorX}
        x2={position.x}
        y1={position.anchorY}
        y2={position.y}
      />
      <g transform={`translate(${position.x} ${position.y}) scale(${scale}) translate(${-position.x} ${-position.y})`}>
        <animateTransform
          attributeName="transform"
          dur="1.8s"
          repeatCount="indefinite"
          type="translate"
          values="0 0; 0 -5; 0 0"
        />
        <circle cx={position.x} cy={position.y} fill="#a78bfa" opacity="0.26" r="30">
          <animate
            attributeName="r"
            dur="1.8s"
            repeatCount="indefinite"
            values="28; 36; 28"
          />
          <animate
            attributeName="opacity"
            dur="1.8s"
            repeatCount="indefinite"
            values="0.3; 0.06; 0.3"
          />
        </circle>
        <circle
          cx={position.x}
          cy={position.y}
          fill="#f5f3ff"
          r="26"
          stroke="#6d28d9"
          strokeWidth="2.5"
        />
        <MessageCircle
          color="#5b21b6"
          fill="#ffffff"
          height={36}
          strokeWidth={2.5}
          width={36}
          x={position.x - 18}
          y={position.y - 18}
        />
        {commentCount > 1 ? (
          <g>
            <circle cx={position.x + 20} cy={position.y - 20} fill="#6d28d9" r="12" />
            <text
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="12"
              fontWeight="800"
              textAnchor="middle"
              x={position.x + 20}
              y={position.y - 20}
            >
              {commentCount}
            </text>
          </g>
        ) : null}
      </g>
    </g>
  );
}

function RelatedIssuesPanel({
  issues,
  onSelectIssue,
}: {
  issues: EnrichedIssue[];
  onSelectIssue: (issue: EnrichedIssue) => void;
}) {
  const openIssueCount = issues.filter(isOpenIssue).length;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Issues</h3>
        <span className={openIssueCount > 0 ? "text-xs font-medium text-red-700" : "text-xs text-muted-foreground"}>
          {openIssueCount > 0
            ? `${openIssueCount} open / ${issues.length} total`
            : `${issues.length} total`}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {issues.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No linked Infralink issues.
          </p>
        ) : (
          issues.map((issue) => (
            <button
              className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted"
              key={issue.row_id}
              onClick={() => onSelectIssue(issue)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="break-words text-xs font-semibold">
                  {issue.case_id ?? "Unknown case"}
                </span>
                <IssueStatusBadge status={issue.status} />
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                {issue.summary || "No summary available."}
              </p>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function MvDailyTestPanel({ annotation }: { annotation: PowerPlanAnnotation }) {
  const history = annotation.mv_daily_test_history ?? [];
  if (history.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">MV Daily Test</h3>
        <span className="text-xs text-muted-foreground">{history.length} records</span>
      </div>
      <div className="mt-2 space-y-2">
        {history.map((entry) => (
          <article
            className="rounded-md border bg-background p-3"
            key={`${entry.date}-${entry.status}-${entry.report_name ?? ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${mvTestStatusTone(entry.status)}`}
              >
                {mvTestStatusLabel(entry.status)}
              </span>
              <span className="text-xs font-medium text-slate-700">
                {formatMvTestDate(entry.date)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MvCommentsPanel({
  comments,
  draft,
  error,
  loading,
  saving,
  deletingCommentId,
  onDraftChange,
  onDelete,
  onSave,
}: {
  comments: MvEquipmentComment[];
  draft: string;
  error: string | null;
  loading: boolean;
  saving: boolean;
  deletingCommentId: string | null;
  onDraftChange: (value: string) => void;
  onDelete: (commentId: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Comments</h3>
        <span className="text-xs text-muted-foreground">
          {comments.length} total
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {loading ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Loading comments…
          </p>
        ) : comments.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No comments yet.
          </p>
        ) : (
          comments.map((comment) => (
            <article className="rounded-md border bg-background p-3" key={comment.comment_id}>
              <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                {comment.text}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <time className="text-[11px] text-muted-foreground" dateTime={comment.created_at}>
                  {formatCommentTimestamp(comment.created_at)}
                </time>
                <button
                  aria-label={`Delete comment: ${comment.text}`}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={deletingCommentId === comment.comment_id}
                  onClick={() => onDelete(comment.comment_id)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {deletingCommentId === comment.comment_id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="mv-equipment-comment">
        Add comment
      </label>
      <textarea
        className="mt-1 min-h-20 w-full resize-y rounded-md border bg-background p-2 text-xs leading-5 outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id="mv-equipment-comment"
        maxLength={4000}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Add a note for this MV item…"
        value={draft}
      />
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
      <button
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!draft.trim() || saving}
        onClick={onSave}
        type="button"
      >
        <Send className="h-3.5 w-3.5" aria-hidden="true" />
        {saving ? "Saving…" : "Add comment"}
      </button>
    </section>
  );
}

function FeederCableAtpPanel({
  annotation,
  onPreview,
}: {
  annotation: PowerPlanAnnotation;
  onPreview: (preview: AtpPreview) => void;
}) {
  const files = annotation.feeder_cable_atp_files ?? [];
  const referencedNames = annotation.feeder_cable_atp_names ?? [];
  const missingRequired = isRequiredAtpMissing(annotation);
  if (
    !isConnection(annotation) ||
    (!missingRequired && files.length === 0 && referencedNames.length === 0)
  ) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Feeder Cable ATP
        </h3>
        <span
          className={
            missingRequired
              ? "text-xs font-semibold text-red-700"
              : files.length > 0
                ? "text-xs font-medium text-emerald-700"
                : "text-xs font-medium text-amber-700"
          }
        >
          {missingRequired
            ? "Required file missing"
            : `${files.length} file${files.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {missingRequired ? (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>L3 status requires a downloaded Feeder Cable ATP PDF.</span>
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="mt-2 space-y-2">
          {files.map((file) => (
            <button
              className="flex w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-left text-xs font-semibold text-blue-950 hover:bg-blue-100"
              key={file.relative_path}
              onClick={() => onPreview({ fileName: file.file_name, url: file.url })}
              type="button"
            >
              <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              <span className="min-w-0 break-all underline-offset-4 hover:underline">
                {file.file_name}
              </span>
            </button>
          ))}
        </div>
      ) : referencedNames.length > 0 && !missingRequired ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Listed in JC2 but not downloaded: {referencedNames.join(", ")}
        </div>
      ) : null}
    </section>
  );
}

function AtpPreviewModal({
  preview,
  onClose,
}: {
  preview: AtpPreview | null;
  onClose: () => void;
}) {
  if (!preview) return null;
  return (
    <div className="fixed inset-0 z-[80]" onClick={(event) => event.stopPropagation()}>
      <button
        aria-label="Close Feeder Cable ATP preview overlay"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        type="button"
      />
      <section className="absolute inset-3 flex flex-col overflow-hidden rounded-md border bg-background shadow-2xl md:inset-6">
        <header className="flex items-center justify-between gap-4 border-b bg-card p-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Feeder Cable ATP
            </div>
            <h2 className="mt-1 break-all text-base font-semibold">{preview.fileName}</h2>
          </div>
          <button
            aria-label="Close Feeder Cable ATP preview"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <iframe
          className="h-full w-full flex-1 bg-white"
          src={preview.url}
          title={preview.fileName}
        />
      </section>
    </div>
  );
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
  const currentPage = useMemo(() => {
    const page = combineMvPages(pages);
    if (!page) return null;
    const rows = new Map(enrichPowerPlanEquipment(page.annotations, data).map(
      (row) => [row.annotation.annotation_id, row],
    ));
    return {
      ...page,
      annotations: page.annotations.map((annotation): PowerPlanAnnotation => {
        const row = rows.get(annotation.annotation_id);
        return {
          ...annotation,
          netaComplete: row?.status === "ready",
          netaCompletedAt: row?.equipment?.neta_completed_at,
          trackingRequired: requiresEquipmentTestTracking({
            ...row?.equipment,
            equipment_id: row?.equipment?.equipment_id ?? annotation.matched_equipment_id,
            source_equipment_label: annotation.label,
          }),
          failedCount: row?.failedCount || (isMvDailyTestFailed(annotation) ? 1 : 0),
        };
      }),
    };
  }, [pages, data]);
  const fullViewport = useMemo(
    () => currentPage ? annotationBounds(currentPage) : { x: 0, y: 0, width: 1, height: 1 },
    [currentPage],
  );
  const [viewport, setViewport] = useState<PowerPlanRect>(fullViewport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<EnrichedIssue | null>(null);
  const [atpPreview, setAtpPreview] = useState<AtpPreview | null>(null);
  const [comments, setComments] = useState<MvEquipmentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const suppressClickRef = useRef(false);
  const enrichedIssues = useMemo(
    () => enrichIssuesWithPdmContext(data.cases, data.pdms, data.equipment),
    [data.cases, data.equipment, data.pdms],
  );
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      counts.set(comment.annotation_id, (counts.get(comment.annotation_id) ?? 0) + 1);
    });
    return counts;
  }, [comments]);

  useEffect(() => {
    setViewport(fullViewport);
    setSelectedId(null);
    setSelectedIssue(null);
    setAtpPreview(null);
  }, [fullViewport]);

  useEffect(() => {
    let active = true;
    setCommentsLoading(true);
    void getMvEquipmentComments()
      .then((response) => {
        if (!active) return;
        setComments(response.comments);
        setCommentsError(null);
      })
      .catch(() => {
        if (active) {
          setCommentsError("Comments are unavailable. Start the local dashboard service to add or view them.");
        }
      })
      .finally(() => {
        if (active) setCommentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCommentDraft("");
  }, [selectedId]);

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
  const selectedPalette = selected ? getSystemElementPalette(selected) : NEUTRAL_PALETTE;
  const relatedIssues = getRelatedIssues(selected, enrichedIssues);
  const selectedComments = selected
    ? comments.filter((comment) => comment.annotation_id === selected.annotation_id)
    : [];
  const missingRequiredAtpCount = currentPage.annotations.filter(isRequiredAtpMissing).length;
  const commentIndicatorScale = Math.max(1, viewport.width / fullViewport.width);
  const highlightCounts = currentPage.annotations.reduce<Record<MvStatusHighlight, number>>(
    (counts, annotation) => {
      if (["equipment", "termination", "connection"].includes(annotation.kind)) {
        counts[getStatusHighlight(annotation)] += 1;
      }
      return counts;
    },
    {
      netaComplete: 0,
      dailyPassedPendingNeta: 0,
      failed: 0,
      cableTestedAndUpdated: 0,
      cableUpdatePending: 0,
      shipToSite: 0,
      installationComplete: 0,
      neutral: 0,
    },
  );

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (
      (event.target as Element).closest(
        "[data-mv-equipment='true'], [data-mv-termination='true'], [data-mv-connection='true'], [data-mv-comment-indicator='true']",
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
    // `meet` may letterbox the SVG. Use its uniform rendered scale instead of
    // the element's height/width so both pan directions track the pointer.
    const renderedScale = Math.max(
      Number.EPSILON,
      Math.min(bounds.width / pan.viewport.width, bounds.height / pan.viewport.height),
    );
    setViewport({
      ...pan.viewport,
      x: pan.viewport.x - dx / renderedScale,
      y: pan.viewport.y - dy / renderedScale,
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

  async function handleSaveComment() {
    if (!selected || !commentDraft.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const response = await addMvEquipmentComment({
        annotation_id: selected.annotation_id,
        text: commentDraft.trim(),
      });
      setComments((current) => [...current, response.comment]);
      setCommentDraft("");
      setCommentsError(null);
    } catch {
      setCommentsError("Comment could not be saved. Check that the local dashboard service is running.");
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await deleteMvEquipmentComment(commentId);
      setComments((current) => current.filter((comment) => comment.comment_id !== commentId));
      setCommentsError(null);
    } catch {
      setCommentsError("Comment could not be deleted. Check that the local dashboard service is running.");
    } finally {
      setDeletingCommentId(null);
    }
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
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-green-600 bg-green-100" />
            {`Cable Tested + Infralink Updated ${highlightCounts.cableTestedAndUpdated}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-blue-600 bg-blue-100" />
            {`Cable Tested / Infralink Pending ${highlightCounts.cableUpdatePending}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-emerald-600 bg-emerald-100" />
            {`NETA Complete ${highlightCounts.netaComplete}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-green-300 bg-green-50" />
            {`MV Daily Passed / NETA Pending ${highlightCounts.dailyPassedPendingNeta}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-800">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-red-800 bg-red-500" />
            {`MV Daily Failed ${highlightCounts.failed}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-purple-700 bg-purple-100" />
            {`Ship to Site ${highlightCounts.shipToSite}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-amber-600 bg-amber-100" />
            {`Cable / Termination Installation Complete ${highlightCounts.installationComplete}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-slate-500 bg-white" />
            {`Other status ${highlightCounts.neutral}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {`L3 Missing ATP ${missingRequiredAtpCount}`}
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
                      {isRequiredAtpMissing(annotation) ? (
                        <g
                          pointerEvents="none"
                          transform={`translate(${annotation.center.x} ${annotation.center.y})`}
                        >
                          <circle fill="#dc2626" r="15" stroke="#ffffff" strokeWidth="3" />
                          <text
                            dominantBaseline="central"
                            fill="#ffffff"
                            fontSize="20"
                            fontWeight="800"
                            textAnchor="middle"
                            y="1"
                          >
                            !
                          </text>
                        </g>
                      ) : null}
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
                {currentPage.annotations.filter((annotation) => (annotation.failedCount ?? 0) > 0).map((annotation) => (
                  <g
                    aria-label={`${annotation.label}: ${annotation.failedCount} failed test items`}
                    key={`${annotation.annotation_id}-failed`}
                    pointerEvents="none"
                    transform={`translate(${annotation.rect.x + annotation.rect.width} ${annotation.rect.y})`}
                  >
                    <g className="animate-equipment-failed">
                      <circle fill="#b91c1c" r="12" stroke="white" strokeWidth="2" />
                      <text fill="white" fontSize="10" fontWeight="700" textAnchor="middle" y="3">
                        {annotation.failedCount}
                      </text>
                    </g>
                  </g>
                ))}
                {currentPage.annotations.map((annotation) => {
                  const commentCount = commentCounts.get(annotation.annotation_id) ?? 0;
                  return commentCount > 0 ? (
                    <MvCommentIndicator
                      annotation={annotation}
                      commentCount={commentCount}
                      key={`${annotation.annotation_id}-comments`}
                      onSelect={() => setSelectedId(annotation.annotation_id)}
                      scale={commentIndicatorScale}
                    />
                  ) : null;
                })}
              </svg>
            </div>
            <aside className="flex min-h-0 max-h-[680px] flex-col overflow-hidden border-t bg-card xl:h-[680px] xl:border-l xl:border-t-0">
              {selected ? (
                <>
                  <div className="border-b p-4">
                    <button
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      onClick={() => setSelectedId(null)}
                      type="button"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      MV equipment
                    </button>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isConnection(selected) ? (
                            <Cable className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
                          ) : isTermination(selected) ? (
                            <CircleDot className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
                          ) : (
                            <Boxes className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
                          )}
                          <h2 className="break-words text-base font-semibold">{selected.label}</h2>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isConnection(selected)
                            ? "MV cable connection"
                            : isTermination(selected)
                              ? "MV termination"
                              : "MV equipment"}
                        </p>
                      </div>
                      <div
                        className="max-w-[120px] shrink-0 rounded-md border px-2 py-1 text-right text-xs font-semibold leading-4"
                        style={{
                          backgroundColor: selectedPalette.fill,
                          borderColor: selectedPalette.stroke,
                          color: selectedPalette.text,
                        }}
                      >
                        {selected.system_element_status || "Status unavailable"}
                      </div>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [overflow-anchor:none] [scrollbar-gutter:stable]">
                    <MvCommentsPanel
                      comments={selectedComments}
                      deletingCommentId={deletingCommentId}
                      draft={commentDraft}
                      error={commentsError}
                      loading={commentsLoading}
                      onDelete={(commentId) => void handleDeleteComment(commentId)}
                      onDraftChange={setCommentDraft}
                      onSave={() => void handleSaveComment()}
                      saving={commentSaving}
                    />
                    <section>
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                        System Element
                      </h3>
                      <dl className="mt-2 divide-y rounded-md border bg-background">
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
                          <dt className="text-muted-foreground">Type</dt>
                          <dd className="break-words font-medium">
                            {selected.system_element_type || "--"}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
                          <dt className="text-muted-foreground">Matched ID</dt>
                          <dd className="break-words font-medium">
                            {selected.matched_equipment_id || "Not matched"}
                          </dd>
                        </div>
                        {selected.kind === "equipment" ? (
                          <>
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
                              <dt className="text-muted-foreground">Infralink NETA</dt>
                              <dd className={selected.netaComplete ? "font-semibold text-emerald-700" : "font-medium"}>
                                {selected.trackingRequired ? (selected.netaComplete ? "NETA Complete" : "Incomplete") : "Not Tracked"}
                              </dd>
                            </div>
                            {selected.netaComplete ? (
                              <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
                                <dt className="text-muted-foreground">NETA Completed</dt>
                                <dd className="font-medium">{selected.netaCompletedAt ? formatDateTime(selected.netaCompletedAt) : "Completion date unavailable"}</dd>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        {isConnection(selected) ? (
                          <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs">
                            <dt className="text-muted-foreground">Cable State</dt>
                            <dd>
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cableReadinessTone(selected)}`}
                              >
                                {cableReadinessLabel(selected)}
                              </span>
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                    <FeederCableAtpPanel annotation={selected} onPreview={setAtpPreview} />
                    <RelatedIssuesPanel
                      issues={relatedIssues}
                      onSelectIssue={setSelectedIssue}
                    />
                    <MvDailyTestPanel annotation={selected} />
                  </div>
                </>
              ) : (
                <div className="p-4">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    MV Equipment Details
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Select equipment, a transformer, a screw termination, or a cable to open its details.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
      <IssueDetailDrawer issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
      <AtpPreviewModal preview={atpPreview} onClose={() => setAtpPreview(null)} />
    </div>
  );
}
