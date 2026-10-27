import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileCheck2, FileEdit, Save, X } from "lucide-react";
import type { AutomationRun, SiteDailyReport, TestSite } from "../../types/automation";
import { getSiteDailyReports, saveSiteDailyReport } from "../../utils/automationApi";
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";
import { DAILY_REPORT_PAGE_SIZE, DailyReportTable } from "./DailyReportTable";

const labels = { onsite: "Onsite", offsite: "Offsite" };
const empty = { tested_and_passed: "", failed: "", retested_and_passed: "" };
const editorFields = [
  { key: "failed", label: "Failed", tone: "border-red-200 bg-red-50/50", placeholder: "PDU6-02D-3-CT-PRI" },
  { key: "retested_and_passed", label: "Retested And Passed", tone: "border-teal-200 bg-teal-50/50", placeholder: "PDU6-01A-2-PQM1-CT01" },
  { key: "tested_and_passed", label: "Tested", tone: "border-emerald-200 bg-emerald-50/50", placeholder: "PDU6-02D-1-PQM1-CT01" },
] as const;
function yesterday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const day = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function SiteDailyReportsPanel({ serviceBusy, onSaved }: {
  serviceBusy: boolean; onSaved: (run: AutomationRun | null) => void;
}) {
  const [reports, setReports] = useState<Record<TestSite, SiteDailyReport[]>>({ onsite: [], offsite: [] });
  const [site, setSite] = useState<TestSite>("onsite");
  const [editor, setEditor] = useState<TestSite | null>(null);
  const [day, setDay] = useState(yesterday);
  const [sections, setSections] = useState(empty);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [onsite, offsite] = await Promise.all([getSiteDailyReports("onsite"), getSiteDailyReports("offsite")]);
      setReports({ onsite, offsite });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load site reports.");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  function open(target: TestSite, report?: SiteDailyReport) {
    setEditor(target); setDay(report?.report_name.slice(0, 10) ?? yesterday());
    setSections(report ? {
      tested_and_passed: report.sections.tested_and_passed.join("\n"),
      failed: report.sections.failed.join("\n"), retested_and_passed: report.sections.retested_and_passed.join("\n"),
    } : empty);
    setError(null); setMessage(null); setConfirmOverwrite(false);
  }
  async function save(overwrite: boolean) {
    if (!editor || !day) return;
    const exists = reports[editor].some((report) => report.report_name === `${day}.md`);
    if (exists && !overwrite) { setConfirmOverwrite(true); return; }
    setSaving(true); setError(null);
    try {
      const result = await saveSiteDailyReport(editor, `${day}.md`, { ...sections, overwrite });
      setEditor(null);
      await refresh();
      setMessage(result.rebuild_error
        ? `Report saved. Summary rebuild could not start: ${result.rebuild_error}. Run Rebuild Daily Test Summary to retry.`
        : "Report saved. Summary rebuild queued; run Dashboard ETL afterward to refresh dashboard data.");
      onSaved(result.wash_run);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save report.");
    } finally { setSaving(false); setConfirmOverwrite(false); }
  }
  const count = reports[site].length;
  const pages = Math.max(1, Math.ceil(count / DAILY_REPORT_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visibleReports = reportsExpanded
    ? reports[site].slice((currentPage - 1) * DAILY_REPORT_PAGE_SIZE, currentPage * DAILY_REPORT_PAGE_SIZE)
    : reports[site].slice(0, 1);
  return <section className="bg-card" aria-label="Onsite and Offsite daily reports">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div><h2 className="text-lg font-semibold tracking-normal">Onsite / Offsite Daily Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Equipment, MV and cable tests. Repeated records are preserved and can be filtered in EPS Test Execution.</p></div>
      <div className="flex flex-wrap gap-2">
        {count > 1 && <Button variant="outline" onClick={() => { setReportsExpanded((current) => !current); setPage(1); }}>
          <ChevronRight className={cn("mr-2 h-4 w-4 transition-transform", reportsExpanded && "rotate-90")} />
          {reportsExpanded ? "Show Latest Only" : `Browse All (${count})`}
        </Button>}
        {(["onsite", "offsite"] as const).map((target) =>
        <Button key={target} disabled={serviceBusy} variant="outline" onClick={() => open(target)}>
          <FileEdit className="mr-2 h-4 w-4" />New {labels[target]} Daily Report
        </Button>)}</div>
    </div>
    {error && !editor && <p role="alert" className="px-5 py-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="px-5 py-3 text-sm">{message}</p>}
    <div className="flex gap-1 border-b bg-muted/20 px-5 pt-3">{(["onsite", "offsite"] as const).map((target) =>
      <button type="button" key={target} className={cn("border-b-2 px-4 py-2 text-sm font-semibold", site === target ? "border-blue-600 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => { setSite(target); setPage(1); }}>
        {labels[target]} Reports ({reports[target].length})
      </button>)}</div>
    <DailyReportTable reports={visibleReports}
      emptyMessage={`No ${labels[site]} reports yet.`} disabled={serviceBusy} onEdit={(report) => open(site, report)} />
    {reportsExpanded && pages > 1 && <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm">
      <span className="text-muted-foreground">Page {currentPage} of {pages} / {count} reports</span>
      <div className="flex gap-2">
        <Button aria-label="Previous site report page" title="Previous page" className="w-9 px-0" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button aria-label="Next site report page" title="Next page" className="w-9 px-0" variant="outline" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>}
    {editor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={`${labels[editor]} Daily Test Report`}>
      <div className="flex max-h-[94vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-normal">{labels[editor]} Daily Test Report</h2>
            <p className="mt-1 text-sm text-muted-foreground">One test item per line. Markdown bullets are accepted.</p>
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Close site report" disabled={saving} onClick={() => setEditor(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <label className="flex items-center gap-3 text-sm font-medium">Report date<input type="date" value={day} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" onChange={(event) => { setDay(event.target.value); setConfirmOverwrite(false); }} /></label>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">{editorFields.map((field) => <label className={`block rounded-md border p-3 ${field.tone}`} key={field.key}>
            <span className="flex items-center justify-between gap-3 text-sm font-semibold">
              {field.label}
              <span className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium">
                {sections[field.key].split("\n").filter((line) => line.trim()).length}
              </span>
            </span>
            <textarea
              aria-label={field.label}
              className="mt-3 min-h-[360px] w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              placeholder={field.placeholder}
              spellCheck={false}
              value={sections[field.key]}
              onChange={(event) => { setSections({ ...sections, [field.key]: event.target.value }); setConfirmOverwrite(false); }}
            />
          </label>)}</div>
          {error && <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          {confirmOverwrite && <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">A {labels[editor]} report already exists for this date. Replace that report?</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><FileCheck2 className="h-4 w-4" />Saving also rebuilds the daily test summary.</div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setEditor(null)}>Cancel</Button>
            <Button disabled={saving || serviceBusy || !day} onClick={() => void save(confirmOverwrite)}>
              <Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : confirmOverwrite ? "Confirm overwrite" : "Save Report"}
            </Button>
          </div>
        </div>
      </div>
    </div>}
  </section>;
}
