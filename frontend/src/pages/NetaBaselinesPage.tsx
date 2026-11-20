import { AlertTriangle, ClipboardCheck, Layers, ListChecks, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { NetaBaselineEditor } from "../components/netaBaselines/NetaBaselineEditor";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { KpiCard } from "../components/common/KpiCard";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import type {
  NetaPositionBaselines,
  NetaPositionCell,
  NetaPositionCheck,
  NetaPositionEquipment,
  NetaPositionFamily,
} from "../types/netaPositions";
import { getNetaPositionBaselines } from "../utils/automationApi";
import { cn } from "../utils/cn";
import { formatDateTime, formatNumber } from "../utils/formatters";
import { issueLabel, loadNetaPositionCheck } from "../utils/loadNetaPositionCheck";

type View = "families" | "anomalies";

const ISSUE_FILTERS = [
  "nonconforming", "complete_but_nonconforming", "missing", "failed_only", "retest_unordered",
  "duplicate", "duplicate_different_sn", "extra", "needs_review", "asset_equipment_conflict",
  "report_belongs_elsewhere", "gc_name_mismatch", "result_pending",
] as const;

const cellStyles: Record<NetaPositionCell["result"], { label: string; className: string }> = {
  pass: { label: "✓", className: "bg-emerald-50 text-emerald-700" },
  missing: { label: "–", className: "bg-red-100 text-red-700 font-semibold" },
  failed_only: { label: "F", className: "bg-red-600 text-white font-semibold" },
  retest_unordered: { label: "F/P", className: "bg-amber-100 text-amber-800" },
  result_pending: { label: "?", className: "bg-slate-100 text-slate-600" },
  waived: { label: "W", className: "bg-slate-50 text-slate-400" },
  optional_missing: { label: "o", className: "bg-slate-50 text-slate-400" },
};

function basisBadge(family: NetaPositionFamily) {
  if (family.baseline_basis === "confirmed") {
    return family.draft_differs_from_confirmed
      ? <StatusBadge tone="warning">Confirmed · draft changed</StatusBadge>
      : <StatusBadge tone="success">Confirmed</StatusBadge>;
  }
  if (family.draft.status === "needs_decision") return <StatusBadge tone="warning">Needs decision</StatusBadge>;
  if (family.baseline_basis === "draft") return <StatusBadge tone="default">Draft</StatusBadge>;
  return <StatusBadge tone="muted">No baseline</StatusBadge>;
}

function matchesIssue(entry: NetaPositionEquipment, issue: string) {
  if (issue === "nonconforming") return entry.nonconforming;
  if (issue === "complete_but_nonconforming") return entry.complete_but_nonconforming;
  return (entry.issue_counts[issue] ?? 0) > 0;
}

function issueSummary(entry: NetaPositionEquipment) {
  const bad = entry.positions.filter((cell) => cell.result !== "pass" && cell.result !== "waived");
  const parts = bad.map((cell) => `${cell.key}: ${issueLabel(cell.result)}`);
  if (entry.extra_reports.length) parts.push(`extra: ${entry.extra_reports.map((item) => item.key).join(", ")}`);
  if (entry.needs_review_reports.length) parts.push(`unrecognized: ${entry.needs_review_reports.length}`);
  const conflicts = entry.reports.filter((report) => report.flags.includes("asset_equipment_conflict"));
  if (conflicts.length) parts.push(`name refs ${[...new Set(conflicts.map((report) => report.referenced_equipment))].join(", ")}`);
  return parts.join(" · ");
}

function EquipmentReports({ entry }: { entry: NetaPositionEquipment }) {
  return (
    <div className="mt-4 rounded-md border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">{entry.equipment_id}</span>
        {entry.neta_complete ? <StatusBadge tone="success">NETA complete</StatusBadge> : <StatusBadge tone="muted">In progress</StatusBadge>}
        {entry.report_stage === "temporary" ? <StatusBadge tone="warning">Temporary reports</StatusBadge> : null}
        <span className="text-muted-foreground">{entry.report_count} device reports</span>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="px-3 py-2">GC report</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">PDF header</th><th className="px-3 py-2">Recognition</th>
            </tr>
          </thead>
          <tbody>
            {entry.reports.map((report) => {
              const pdf = report.pdf_fields ?? {};
              return (
                <tr className="border-t align-top" key={report.file}>
                  <td className="px-3 py-1.5">
                    <a className="text-primary hover:underline" href={report.url} rel="noreferrer" target="_blank">{report.file.split("/").pop()}</a>
                    {report.source_report_name ? <div className="text-muted-foreground">{report.source_report_name}</div> : null}
                    {report.suggested_gc_name ? (
                      <div className="mt-0.5 text-amber-700">Suggested GC name: <span className="font-mono">{report.suggested_gc_name}</span></div>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-mono">{report.key}</div>
                    <div className="text-muted-foreground">{report.name_source.replace("pdf_", "PDF ").replace("gc_name", "GC name")}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge tone={report.status === "PASSED" ? "success" : report.status === "FAILED" ? "danger" : "muted"}>{report.status}</StatusBadge>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {pdf.asset || pdf.filename || pdf.designation ? <div className="font-mono text-foreground">{pdf.asset || pdf.filename || pdf.designation}</div> : null}
                    <div>
                      {[report.test_date, report.serial_number ? `SN ${report.serial_number}` : null, pdf.cubicle_code ? `cubicle ${pdf.cubicle_code}` : null,
                        report.text_source === "ocr" ? "OCR" : null].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {report.confidence}
                    {report.flags.length ? ` · ${report.flags.map(issueLabel).join(", ")}` : ""}
                    {report.referenced_equipment ? ` → ${report.referenced_equipment}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FamilyDetailProps {
  family: NetaPositionFamily;
  equipment: NetaPositionEquipment[];
  baselines: NetaPositionBaselines | null;
  editable: boolean;
  onBaselinesSaved: (baselines: NetaPositionBaselines) => void;
}

function FamilyDetail({ family, equipment, baselines, editable, onBaselinesSaved }: FamilyDetailProps) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = equipment.filter((entry) => !onlyProblems || entry.nonconforming || Object.keys(entry.issue_counts).length > 0);
  const keys = family.baseline_positions;
  const reportUrl = (entry: NetaPositionEquipment, file: string) => entry.reports.find((report) => report.file === file)?.url;
  const selectedEntry = equipment.find((entry) => entry.equipment_id === selected) ?? null;
  const extraKeys = Object.keys(family.draft.support).filter((key) => !keys.includes(key));

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono">{family.family}</CardTitle>
          {basisBadge(family)}
        </div>
        <p className="text-sm text-muted-foreground">
          {family.member_count} equipment · {family.neta_complete_count} NETA complete ·
          draft from {family.draft.complete_member_count} complete equipment with reports
          (position kept when present in more than half).
        </p>
      </CardHeader>
      <CardContent>
        {keys.length === 0 ? (
          <EmptyState title="No baseline" description="Needs at least 2 NETA-complete equipment with reports." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-1.5">
                <input checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} type="checkbox" />
                Only equipment with issues
              </label>
              {Object.entries(cellStyles).slice(0, 5).map(([result, style]) => (
                <span className="inline-flex items-center gap-1" key={result}>
                  <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded px-1", style.className)}>{style.label}</span>
                  {result === "missing" ? "missing" : issueLabel(result)}
                </span>
              ))}
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="sticky left-0 z-20 border-b bg-card px-2 py-2 text-left">Equipment</th>
                    {keys.map((key) => (
                      <th className="border-b px-1 py-2 align-bottom" key={key}>
                        <div className="whitespace-nowrap font-mono [writing-mode:vertical-rl] rotate-180">{key}</div>
                        <div className="mt-1 font-normal text-muted-foreground">{family.draft.support[key] ?? 0}/{family.draft.complete_member_count}</div>
                      </th>
                    ))}
                    <th className="border-b px-2 py-2 text-left">Other</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const cells = new Map(entry.positions.map((cell) => [cell.key, cell]));
                    return (
                      <tr className={cn("hover:bg-accent/40", selected === entry.equipment_id && "bg-accent/60")} key={entry.equipment_id}>
                        <td className="sticky left-0 border-b bg-card px-2 py-1">
                          <button className="whitespace-nowrap text-left font-mono hover:underline" onClick={() => setSelected(entry.equipment_id)} type="button">
                            {entry.equipment_id.replace(/^IAD06-/, "")}
                          </button>
                          {entry.neta_complete ? <span className="ml-1 text-emerald-700" title="NETA complete">●</span> : null}
                          {entry.report_stage === "temporary" ? <span className="ml-1 text-amber-600" title="Temporary reports">T</span> : null}
                        </td>
                        {keys.map((key) => {
                          const cell = cells.get(key);
                          if (!cell) return <td className="border-b" key={key} />;
                          const style = cellStyles[cell.result];
                          const url = cell.reports[0] ? reportUrl(entry, cell.reports[0]) : undefined;
                          const label = cell.notes.includes("duplicate") ? `${style.label}${cell.reports.length}` : style.label;
                          const title = `${key}: ${cell.result}${cell.notes.length ? ` (${cell.notes.join(", ")})` : ""}\n${cell.reports.map((file) => file.split("/").pop()).join("\n")}`;
                          return (
                            <td className="border-b p-0.5 text-center" key={key}>
                              {url ? (
                                <a className={cn("flex h-6 min-w-7 items-center justify-center rounded", style.className)} href={url} rel="noreferrer" target="_blank" title={title}>{label}</a>
                              ) : (
                                <span className={cn("flex h-6 min-w-7 items-center justify-center rounded", style.className)} title={title}>{label}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-b px-2 py-1 text-muted-foreground">
                          {[...entry.extra_reports.map((item) => `+${item.key}`), ...entry.needs_review_reports.map((item) => `?${item.key}`)].join(" ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {extraKeys.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Below the majority threshold: {extraKeys.map((key) => `${key} (${family.draft.support[key]})`).join(", ")}
              </p>
            ) : null}
          </>
        )}
        {selectedEntry ? <EquipmentReports entry={selectedEntry} /> : null}
        <NetaBaselineEditor baselines={baselines} editable={editable} family={family} onSaved={onBaselinesSaved} />
      </CardContent>
    </Card>
  );
}

function AnomalyTable({ data }: { data: NetaPositionCheck }) {
  const [issue, setIssue] = useState<string>("complete_but_nonconforming");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = data.equipment
    .filter((entry) => matchesIssue(entry, issue))
    .filter((entry) => !query || entry.equipment_id.toLowerCase().includes(query.toLowerCase()));
  const selectedEntry = data.equipment.find((entry) => entry.equipment_id === selected) ?? null;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select aria-label="Issue filter" className="h-9 rounded-md border bg-background px-2 text-sm" onChange={(event) => setIssue(event.target.value)} value={issue}>
            {ISSUE_FILTERS.map((code) => (
              <option key={code} value={code}>
                {code === "nonconforming" ? "Nonconforming (missing / FAIL only)" : issueLabel(code)}
                {code !== "nonconforming" && code !== "complete_but_nonconforming" ? ` (${data.summary.equipment_by_issue?.[code] ?? 0})` : ""}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input className="h-9 rounded-md border bg-background pl-8 pr-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Equipment" value={query} />
          </div>
          <span className="text-sm text-muted-foreground">{rows.length} equipment</span>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Equipment</th><th className="px-3 py-2">Family</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reports</th><th className="px-3 py-2">Findings</th></tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr className={cn("cursor-pointer border-t hover:bg-accent/40", selected === entry.equipment_id && "bg-accent/60")} key={entry.equipment_id} onClick={() => setSelected(entry.equipment_id)}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{entry.equipment_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{entry.family}</td>
                  <td className="px-3 py-2">{entry.neta_complete ? <StatusBadge tone="success">Complete</StatusBadge> : <StatusBadge tone="muted">In progress</StatusBadge>}</td>
                  <td className="px-3 py-2 text-xs">{entry.report_count}{entry.report_stage === "temporary" ? " (temp)" : ""}</td>
                  <td className="px-3 py-2 text-xs">{issueSummary(entry) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedEntry ? <EquipmentReports entry={selectedEntry} /> : null}
      </CardContent>
    </Card>
  );
}

export function NetaBaselinesPage() {
  const [data, setData] = useState<NetaPositionCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("families");
  const [familyFilter, setFamilyFilter] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<NetaPositionBaselines | null>(null);
  const [editable, setEditable] = useState(false);

  const load = () => {
    setError(null);
    loadNetaPositionCheck().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    // The automation service is optional (static hosting); the page then stays read-only.
    getNetaPositionBaselines()
      .then(({ editable: canEdit, ...payload }) => { setBaselines(payload); setEditable(canEdit); })
      .catch(() => { setBaselines(null); setEditable(false); });
  };
  useEffect(load, []);

  const families = useMemo(() => [...(data?.families ?? [])]
    .filter((family) => family.family.toLowerCase().includes(familyFilter.toLowerCase()))
    .sort((left, right) => right.nonconforming_count - left.nonconforming_count || right.member_count - left.member_count),
  [data, familyFilter]);
  const activeFamily = families.find((family) => family.family === selectedFamily) ?? families[0] ?? null;
  const familyEquipment = useMemo(
    () => (data?.equipment ?? []).filter((entry) => entry.family === activeFamily?.family),
    [data, activeFamily],
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;
  if (!data.available) {
    return <EmptyState title="NETA position check unavailable" description="Tracker review results were not found when the ETL ran." />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">NETA Position Baselines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated {formatDateTime(data.generated_at)} · baseline revision {data.baseline_revision} ·
          positions from {data.report_fields_available ? "PDF fields" : "GC file names"}
        </p>
      </div>
      {data.summary.families_confirmed === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          No baseline is confirmed yet. Every comparison below uses the auto-generated draft and is a preview only.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Layers className="h-4 w-4" />} label="Families" value={formatNumber(data.summary.families)} description={`${data.summary.families_draft ?? 0} with draft · ${data.summary.families_confirmed ?? 0} confirmed`} />
        <KpiCard icon={<ListChecks className="h-4 w-4" />} label="Equipment checked" value={formatNumber(data.summary.equipment)} />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Nonconforming" value={formatNumber(data.summary.nonconforming_equipment)} description="Missing position or FAIL only" />
        <KpiCard className="border-red-200" icon={<AlertTriangle className="h-4 w-4 text-red-600" />} label="NETA complete but nonconforming" value={<span className="text-red-700">{formatNumber(data.summary.complete_but_nonconforming)}</span>} />
      </div>
      <div className="inline-flex rounded-md border p-0.5">
        {(["families", "anomalies"] as const).map((item) => (
          <button className={cn("rounded px-3 py-1.5 text-sm", view === item ? "bg-accent font-medium" : "text-muted-foreground")} key={item} onClick={() => setView(item)} type="button">
            {item === "families" ? "Families" : "Anomaly list"}
          </button>
        ))}
      </div>
      {view === "anomalies" ? <AnomalyTable data={data} /> : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardContent className="p-3">
              <input className="mb-2 h-9 w-full rounded-md border bg-background px-2 text-sm" onChange={(event) => setFamilyFilter(event.target.value)} placeholder="Filter families" value={familyFilter} />
              <div className="max-h-[70vh] space-y-1 overflow-auto">
                {families.map((family) => (
                  <button
                    className={cn("w-full rounded-md px-2 py-2 text-left hover:bg-accent", activeFamily?.family === family.family && "bg-accent")}
                    key={family.family}
                    onClick={() => setSelectedFamily(family.family)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm">{family.family}</span>
                      {family.nonconforming_count ? <span className="text-xs font-semibold text-red-700">{family.nonconforming_count}</span> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {basisBadge(family)}
                      <span>{family.member_count} eq · {family.baseline_positions.length} pos</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          {activeFamily ? (
            <FamilyDetail
              baselines={baselines}
              editable={editable}
              equipment={familyEquipment}
              family={activeFamily}
              // Remount once when baselines arrive; a save keeps the editor and its message.
              key={`${activeFamily.family}-${baselines ? "loaded" : "none"}`}
              onBaselinesSaved={setBaselines}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
