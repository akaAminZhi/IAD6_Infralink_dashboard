import { Link } from "react-router-dom";

import type { NetaPositionEquipment, NetaPositionResult } from "../../types/netaPositions";
import { cn } from "../../utils/cn";
import { issueLabel } from "../../utils/loadNetaPositionCheck";

const resultStyles: Record<NetaPositionResult, { text: string; className: string }> = {
  pass: { text: "PASS", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  missing: { text: "Missing", className: "border-red-300 bg-red-50 text-red-800" },
  failed_only: { text: "FAIL", className: "border-red-300 bg-red-600 text-white" },
  retest_unordered: { text: "FAIL + PASS", className: "border-amber-300 bg-amber-50 text-amber-800" },
  result_pending: { text: "Pending review", className: "border-slate-200 bg-slate-50 text-slate-600" },
  waived: { text: "Waived", className: "border-slate-200 bg-slate-50 text-slate-500" },
  optional_missing: { text: "Optional", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

export function NetaTestPositionsPanel({ entry }: { entry: NetaPositionEquipment | null }) {
  if (!entry) return null;
  const urls = new Map(entry.reports.map((report) => [report.file, report.url]));
  const problems = entry.positions.filter((cell) => cell.result !== "pass" || cell.notes.length);
  const conflicts = entry.reports.filter((report) =>
    report.flags.some((flag) => ["asset_equipment_conflict", "report_belongs_elsewhere", "gc_name_mismatch"].includes(flag)));
  const fileName = (file: string) => file.split("/").pop();

  return (
    <section aria-label="NETA test positions" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-sm font-semibold">Test positions</h3>
        <span className="text-xs text-muted-foreground">
          {entry.family} · {entry.baseline_basis === "confirmed" ? "confirmed baseline" : entry.baseline_basis === "draft" ? "draft baseline (not confirmed)" : "no baseline"}
          {" · "}
          <Link className="text-primary hover:underline" to="/neta-baselines">Baselines</Link>
        </span>
      </div>
      {entry.complete_but_nonconforming ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
          NETA complete, but the reports do not match the baseline.
        </p>
      ) : null}
      {entry.positions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No baseline for this family yet.</p>
      ) : (
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {entry.positions.map((cell) => {
            const style = resultStyles[cell.result];
            const url = cell.reports[0] ? urls.get(cell.reports[0]) : undefined;
            const notes = cell.notes.filter((note) => cell.result !== "result_pending" || note !== "needs_review");
            return (
              <li className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5" key={cell.key}>
                <span className={cn("inline-flex justify-center rounded border px-1 py-0.5 font-medium", style.className)}>{style.text}</span>
                {url ? (
                  <a className="py-0.5 font-mono text-primary [overflow-wrap:anywhere] hover:underline" href={url} rel="noreferrer" target="_blank" title={cell.reports.map(fileName).join("\n")}>{cell.key}</a>
                ) : <span className="py-0.5 font-mono [overflow-wrap:anywhere]">{cell.key}</span>}
                {notes.length ? <span className="col-start-2 text-muted-foreground">{notes.map(issueLabel).join(", ")}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {problems.length === 0 && entry.positions.length > 0 && !entry.extra_reports.length && !entry.needs_review_reports.length ? (
        <p className="mt-2 text-xs text-emerald-700">All baseline positions have a PASS report.</p>
      ) : null}
      {entry.extra_reports.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Not in baseline: {entry.extra_reports.map((item) => <span className="mr-2 font-mono" key={item.file}>{item.key}</span>)}
        </p>
      ) : null}
      {entry.needs_review_reports.length ? (
        <p className="mt-1 text-xs text-amber-800">
          Position not recognized: {entry.needs_review_reports.map((item) => (
            <a className="mr-2 font-mono hover:underline" href={urls.get(item.file)} key={item.file} rel="noreferrer" target="_blank">{fileName(item.file)}</a>
          ))}
        </p>
      ) : null}
      {conflicts.length ? (
        <ul className="mt-2 space-y-1 text-xs text-amber-900">
          {conflicts.map((report) => (
            <li key={report.file}>
              <span className="font-mono">{fileName(report.file)}</span>: {report.flags
                .filter((flag) => ["asset_equipment_conflict", "report_belongs_elsewhere", "gc_name_mismatch"].includes(flag))
                .map(issueLabel).join(", ")}
              {report.referenced_equipment ? ` (${report.referenced_equipment})` : ""}
              {report.suggested_gc_name ? <> · suggested <span className="font-mono">{report.suggested_gc_name}</span></> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
