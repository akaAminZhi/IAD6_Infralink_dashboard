import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  FileEdit,
  FileText,
  LoaderCircle,
  LogIn,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DailyReportDialog } from "../components/dataOperations/DailyReportDialog";
import { Button } from "../components/ui/button";
import type {
  AutomationHealth,
  AutomationJob,
  AutomationRun,
  AutomationRunStatus,
  DailyReport,
  JobOptions,
  SavedDailyReport,
} from "../types/automation";
import {
  AutomationApiError,
  cancelAutomationRun,
  continueAutomationLogin,
  getAutomationHealth,
  getAutomationJobs,
  getAutomationRuns,
  getDailyReport,
  getDailyReports,
  getRunLogs,
  resumeAutomationRun,
  runAutomationJob,
  startAutomationLogin,
  startDailyPipeline,
} from "../utils/automationApi";
import { cn } from "../utils/cn";

interface DataOperationsPageProps {
  onDashboardReload: () => void;
}

const ACTIVE_STATUSES = new Set<AutomationRunStatus>([
  "queued",
  "running",
  "waiting_for_user",
]);
const RESUMABLE_STATUSES = new Set<AutomationRunStatus>([
  "failed",
  "auth_required",
  "interrupted",
  "cancelled",
]);

const defaultPipelineSteps = [
  "Preflight Checks",
  "Refresh JC2 Excel Exports",
  "Rebuild Daily Test Summary",
  "Download NETA Reports",
  "Download Issue Attachments",
  "Organize GC Reports",
  "Run Dashboard ETL",
];
const REPORT_PAGE_SIZE = 5;

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function duration(run: AutomationRun): string {
  if (!run.started_at) {
    return "--";
  }
  const start = new Date(run.started_at).valueOf();
  const end = run.finished_at ? new Date(run.finished_at).valueOf() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusTone(status: string): string {
  if (status === "succeeded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "running" || status === "queued") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (status === "waiting_for_user" || status === "auth_required") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "failed" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-border bg-muted text-muted-foreground";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-semibold capitalize",
        statusTone(status),
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </div>
      <button aria-label="Dismiss error" onClick={onClose} type="button">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DataOperationsPage({ onDashboardReload }: DataOperationsPageProps) {
  const [health, setHealth] = useState<AutomationHealth | null>(null);
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState({
    headed: false,
    dry_run: false,
    force: false,
    only: "",
    limit: "",
    no_excel_update: false,
  });
  const logOffsetRef = useRef(0);
  const logPanelRef = useRef<HTMLPreElement | null>(null);
  const lastReloadedEtlRunRef = useRef<string | null>(null);

  const refreshService = useCallback(async () => {
    try {
      const [nextHealth, nextJobs, nextRuns] = await Promise.all([
        getAutomationHealth(),
        getAutomationJobs(),
        getAutomationRuns(),
      ]);
      setHealth(nextHealth);
      setJobs(nextJobs);
      setRuns(nextRuns);
      setServiceError(null);
      const activeId = nextHealth.active_run_id;
      setSelectedRunId((current) => current ?? activeId ?? nextRuns[0]?.run_id ?? null);

      const completedEtlRun = nextRuns.find(
        (run) =>
          run.status === "succeeded" &&
          run.steps.some((step) => step.job_id === "run_dashboard_etl"),
      );
      if (
        completedEtlRun &&
        completedEtlRun.run_id !== lastReloadedEtlRunRef.current
      ) {
        lastReloadedEtlRunRef.current = completedEtlRun.run_id;
        onDashboardReload();
      }
    } catch (error) {
      setHealth(null);
      setServiceError(
        error instanceof Error ? error.message : "The local automation service is unavailable.",
      );
    }
  }, [onDashboardReload]);

  const refreshReports = useCallback(async () => {
    try {
      setReports(await getDailyReports());
    } catch {
      // The service status panel already communicates connection failures.
    }
  }, []);

  useEffect(() => {
    void refreshService();
    void refreshReports();
    const interval = window.setInterval(() => void refreshService(), 1500);
    return () => window.clearInterval(interval);
  }, [refreshReports, refreshService]);

  useEffect(() => {
    logOffsetRef.current = 0;
    setLogText("");
    if (!selectedRunId) {
      return;
    }
    const runId = selectedRunId;
    let active = true;
    async function loadLogs() {
      try {
        const payload = await getRunLogs(runId, logOffsetRef.current);
        if (!active) {
          return;
        }
        logOffsetRef.current = payload.offset;
        if (payload.content) {
          setLogText((current) => current + payload.content);
        }
      } catch {
        // A later polling cycle will retry transient log read failures.
      }
    }
    void loadLogs();
    const interval = window.setInterval(() => void loadLogs(), 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedRunId]);

  useEffect(() => {
    const panel = logPanelRef.current;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [logText]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(reports.length / REPORT_PAGE_SIZE));
    setReportPage((current) => Math.min(current, totalPages));
  }, [reports.length]);

  const activeRun = useMemo(
    () => runs.find((run) => run.run_id === health?.active_run_id) ?? null,
    [health?.active_run_id, runs],
  );
  const selectedRun = runs.find((run) => run.run_id === selectedRunId) ?? null;
  const latestPipeline = runs.find((run) => run.kind === "pipeline") ?? null;
  const resumablePipeline =
    latestPipeline && RESUMABLE_STATUSES.has(latestPipeline.status) ? latestPipeline : null;
  const serviceBusy = Boolean(activeRun);
  const reportPageCount = Math.max(1, Math.ceil(reports.length / REPORT_PAGE_SIZE));
  const visibleReports = reportsExpanded
    ? reports.slice((reportPage - 1) * REPORT_PAGE_SIZE, reportPage * REPORT_PAGE_SIZE)
    : reports.slice(0, 1);

  function optionsForJob(job: AutomationJob, overrides: JobOptions = {}): JobOptions {
    const supported = new Set(job.supported_options);
    const options: JobOptions = {};
    if (supported.has("headed")) options.headed = advanced.headed;
    if (supported.has("dry_run")) options.dry_run = advanced.dry_run;
    if (supported.has("force")) options.force = advanced.force;
    if (supported.has("no_excel_update")) {
      options.no_excel_update = advanced.no_excel_update;
    }
    if (supported.has("only") && advanced.only.trim()) {
      options.only = advanced.only.split(",").map((value) => value.trim()).filter(Boolean);
    }
    if (supported.has("limit") && advanced.limit.trim()) {
      options.limit = Number(advanced.limit);
    }
    return { ...options, ...overrides };
  }

  async function perform(action: () => Promise<AutomationRun>) {
    setActionError(null);
    try {
      const run = await action();
      setSelectedRunId(run.run_id);
      await refreshService();
    } catch (error) {
      setActionError(
        error instanceof AutomationApiError || error instanceof Error
          ? error.message
          : "The automation action could not be started.",
      );
    }
  }

  async function runJob(job: AutomationJob, overrides: JobOptions = {}, confirmed = false) {
    await perform(() => runAutomationJob(job.job_id, optionsForJob(job, overrides), confirmed));
  }

  async function openExistingReport(reportName: string) {
    setLoadingReport(true);
    setActionError(null);
    try {
      const report = await getDailyReport(reportName);
      setEditingReport(report);
      setReportDialogOpen(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The report could not be loaded.");
    } finally {
      setLoadingReport(false);
    }
  }

  function handleReportSaved(result: SavedDailyReport) {
    setReportDialogOpen(false);
    setEditingReport(null);
    setSelectedRunId(result.wash_run.run_id);
    void refreshReports();
    void refreshService();
  }

  const pipelineSteps = latestPipeline?.steps ??
    defaultPipelineSteps.map((label) => ({
      job_id: label,
      label,
      status: "pending" as const,
      started_at: null,
      finished_at: null,
      exit_code: null,
      error: null,
    }));
  const cxalloyJob = jobs.find((job) => job.job_id === "upload_cxalloy_reports");
  const individualJobs = jobs.filter((job) => job.job_id !== "upload_cxalloy_reports");

  if (!health) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Data Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local data refresh, report entry, and controlled external operations.
          </p>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 text-amber-800" />
            <div>
              <h2 className="font-semibold text-amber-950">Local automation service is offline</h2>
              <p className="mt-1 text-sm text-amber-900">
                Start the dashboard and local task service from the project root:
              </p>
              <code className="mt-3 block rounded-md border border-amber-300 bg-background px-3 py-2 text-sm">
                python scripts/start_dashboard.py
              </code>
              {serviceError ? <p className="mt-3 text-xs text-amber-800">{serviceError}</p> : null}
              <Button className="mt-4" onClick={() => void refreshService()} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" /> Retry Connection
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Data Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local data refresh, report entry, and controlled external operations.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Local service connected
        </div>
      </div>

      {actionError ? <ErrorBanner message={actionError} onClose={() => setActionError(null)} /> : null}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid divide-y md:grid-cols-5 md:divide-x md:divide-y-0">
          <div className="p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">EPS Tracker</div>
            <div className={cn("mt-2 font-semibold", health.eps_tracker_exists ? "text-emerald-700" : "text-red-700")}>
              {health.eps_tracker_exists ? "Available" : "Missing"}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground" title={health.eps_tracker_root}>
              {health.eps_tracker_root}
            </div>
          </div>
          {(["jc2", "cxalloy"] as const).map((provider) => (
            <div className="p-4" key={provider}>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                {provider} Session
              </div>
              <div className="mt-2 font-semibold">
                {health.sessions[provider].exists ? "Session saved" : "Login required"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(health.sessions[provider].modified_at)}
              </div>
              <button
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                disabled={serviceBusy}
                onClick={() => void perform(() => startAutomationLogin(provider))}
                type="button"
              >
                <LogIn className="h-3.5 w-3.5" /> Refresh login
              </button>
            </div>
          ))}
          <div className="p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Latest ETL</div>
            <div className="mt-2 font-semibold">
              {health.last_etl?.readable ? "Dataset available" : "Not available"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(health.last_etl?.generated_at)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Active Operation</div>
            <div className="mt-2 font-semibold">{activeRun?.label ?? "Idle"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {activeRun ? duration(activeRun) : "Ready for the next task"}
            </div>
          </div>
        </div>
      </section>

      {activeRun?.status === "waiting_for_user" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div>
            <div className="font-semibold text-amber-950">Browser login is waiting</div>
            <div className="mt-1 text-sm text-amber-900">
              Finish signing in in the opened browser, then confirm here.
            </div>
          </div>
          <Button onClick={() => void perform(() => continueAutomationLogin(activeRun.run_id))}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Login Complete
          </Button>
        </section>
      ) : null}

      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-normal">Daily Test Report Entry</h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              Reports are saved to {health.report_directory}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reports.length > 1 ? (
              <Button
                onClick={() => {
                  setReportsExpanded((current) => !current);
                  setReportPage(1);
                }}
                variant="outline"
              >
                <ChevronRight
                  className={cn(
                    "mr-2 h-4 w-4 transition-transform",
                    reportsExpanded && "rotate-90",
                  )}
                />
                {reportsExpanded ? "Show Latest Only" : `Browse All (${reports.length})`}
              </Button>
            ) : null}
            <Button
              disabled={serviceBusy}
              onClick={() => {
                setEditingReport(null);
                setReportDialogOpen(true);
              }}
            >
              <FileEdit className="mr-2 h-4 w-4" /> New Daily Test Report
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/35 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Report</th>
                <th className="px-4 py-3 font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Retested + Passed</th>
                <th className="px-4 py-3 font-medium">Tested</th>
                <th className="px-4 py-3 font-medium">Modified</th>
                <th className="px-5 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleReports.map((report) => (
                <tr key={report.report_name}>
                  <td className="px-5 py-3 font-semibold">{report.report_name}</td>
                  <td className="px-4 py-3 text-red-700">{report.counts.failed}</td>
                  <td className="px-4 py-3 text-teal-700">{report.counts.retested_and_passed}</td>
                  <td className="px-4 py-3 text-emerald-700">{report.counts.tested}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(report.modified_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      disabled={loadingReport || serviceBusy}
                      onClick={() => void openExistingReport(report.report_name)}
                      variant="ghost"
                    >
                      <FileText className="mr-2 h-4 w-4" /> Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {reports.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>
                    No daily report files found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {reportsExpanded && reports.length > REPORT_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {reportPage} of {reportPageCount} · {reports.length} reports
            </span>
            <div className="flex gap-2">
              <Button
                aria-label="Previous report page"
                className="w-9 px-0"
                disabled={reportPage === 1}
                onClick={() => setReportPage((current) => Math.max(1, current - 1))}
                title="Previous page"
                variant="outline"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Next report page"
                className="w-9 px-0"
                disabled={reportPage === reportPageCount}
                onClick={() =>
                  setReportPage((current) => Math.min(reportPageCount, current + 1))
                }
                title="Next page"
                variant="outline"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-normal">Daily Data Refresh</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Stops on the first failed step and resumes from that point.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {resumablePipeline ? (
              <Button
                disabled={serviceBusy}
                onClick={() => void perform(() => resumeAutomationRun(resumablePipeline.run_id))}
                variant="outline"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Resume Failed Run
              </Button>
            ) : null}
            {activeRun?.kind === "pipeline" ? (
              <Button
                onClick={() => void perform(() => cancelAutomationRun(activeRun.run_id))}
                variant="outline"
              >
                <CircleStop className="mr-2 h-4 w-4" /> Cancel
              </Button>
            ) : (
              <Button
                disabled={serviceBusy}
                onClick={() =>
                  void perform(() =>
                    startDailyPipeline({ headed: advanced.headed, force: advanced.force }),
                  )
                }
              >
                <Play className="mr-2 h-4 w-4" /> Start Daily Refresh
              </Button>
            )}
          </div>
        </div>
        <div className="grid divide-y md:grid-cols-7 md:divide-x md:divide-y-0">
          {pipelineSteps.map((step, index) => (
            <div className="min-w-0 p-4" key={`${step.job_id}-${index}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                {step.status === "running" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                ) : step.status === "succeeded" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : step.status === "failed" || step.status === "auth_required" ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="mt-2 break-words text-sm font-semibold">{step.label}</div>
              <div className="mt-2"><StatusPill status={step.status} /></div>
            </div>
          ))}
        </div>
        <div className="grid min-h-[360px] border-t lg:grid-cols-[320px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-r">
            <div className="border-b px-4 py-3 font-semibold">Recent Runs</div>
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {runs.slice(0, 12).map((run) => (
                <button
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-muted/50",
                    selectedRunId === run.run_id && "bg-accent/60",
                  )}
                  key={run.run_id}
                  onClick={() => setSelectedRunId(run.run_id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{run.label}</span>
                    <StatusPill status={run.status} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{formatDateTime(run.created_at)}</span>
                    <span>{duration(run)}</span>
                  </div>
                </button>
              ))}
              {runs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No runs recorded yet.</div>
              ) : null}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="font-semibold">{selectedRun?.label ?? "Run Log"}</div>
                {selectedRun?.error ? (
                  <div className="mt-1 text-xs text-red-700">{selectedRun.error}</div>
                ) : null}
              </div>
              {selectedRun ? <StatusPill status={selectedRun.status} /> : null}
            </div>
            <pre
              className="h-[310px] overflow-auto whitespace-pre-wrap bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
              ref={logPanelRef}
            >
              {logText || "Select a run to inspect its output."}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <button
          className="flex w-full items-center justify-between gap-3 border-b px-5 py-4 text-left"
          onClick={() => setAdvancedOpen((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2 font-semibold">
            <Settings2 className="h-4 w-4" /> Advanced Task Options
          </span>
          <ChevronRight className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-90")} />
        </button>
        {advancedOpen ? (
          <div className="grid gap-4 border-b bg-muted/20 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {(["headed", "dry_run", "force", "no_excel_update"] as const).map((key) => (
              <label className="flex items-center gap-2 text-sm" key={key}>
                <input
                  checked={advanced[key]}
                  className="h-4 w-4"
                  onChange={(event) =>
                    setAdvanced((current) => ({ ...current, [key]: event.target.checked }))
                  }
                  type="checkbox"
                />
                {key.replace(/_/g, " ")}
              </label>
            ))}
            <label className="text-sm font-medium">
              Only filters, comma separated
              <input
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 font-normal"
                onChange={(event) => setAdvanced((current) => ({ ...current, only: event.target.value }))}
                value={advanced.only}
              />
            </label>
            <label className="text-sm font-medium">
              Limit
              <input
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 font-normal"
                min={1}
                onChange={(event) => setAdvanced((current) => ({ ...current, limit: event.target.value }))}
                type="number"
                value={advanced.limit}
              />
            </label>
          </div>
        ) : null}
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold tracking-normal">Individual Tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Run or retry one controlled operation without starting the full workflow.
          </p>
        </div>
        <div className="divide-y">
          {individualJobs.map((job) => (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={job.job_id}>
              <div>
                <div className="font-semibold">{job.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{job.description}</div>
              </div>
              <Button disabled={serviceBusy} onClick={() => void runJob(job)} variant="outline">
                <Play className="mr-2 h-4 w-4" /> Run
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-red-200 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-normal text-red-800">
              <UploadCloud className="h-5 w-5" /> CxAlloy Report Upload
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              External operation. Uploads organized reports and may update the Testing Matrix.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={serviceBusy || !cxalloyJob}
              onClick={() => cxalloyJob && void runJob(cxalloyJob, { dry_run: true })}
              variant="outline"
            >
              Preview
            </Button>
            <Button
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={serviceBusy || !cxalloyJob}
              onClick={() => setConfirmUpload(true)}
            >
              Upload Reports
            </Button>
          </div>
        </div>
      </section>

      <DailyReportDialog
        existingReportNames={reports.map((report) => report.report_name)}
        initialReport={editingReport}
        onClose={() => {
          setReportDialogOpen(false);
          setEditingReport(null);
        }}
        onSaved={handleReportSaved}
        open={reportDialogOpen}
        serviceBusy={serviceBusy}
      />

      {confirmUpload && cxalloyJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-2xl">
            <h2 className="text-lg font-semibold tracking-normal">Confirm CxAlloy upload</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will upload report files to CxAlloy
              {advanced.no_excel_update
                ? " without changing the Testing Matrix."
                : " and mark successful equipment Complete in the Testing Matrix."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setConfirmUpload(false)} variant="outline">
                Cancel
              </Button>
              <Button
                className="bg-red-700 text-white hover:bg-red-800"
                onClick={() => {
                  setConfirmUpload(false);
                  void runJob(cxalloyJob, { dry_run: false }, true);
                }}
              >
                Confirm Upload
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
