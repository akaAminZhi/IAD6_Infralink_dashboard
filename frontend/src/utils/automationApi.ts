import type {
  AutomationHealth,
  AutomationJob,
  AutomationRun,
  DailyReport,
  DailyReportValidation,
  JobOptions,
  SavedDailyReport,
} from "../types/automation";

const API_BASE =
  import.meta.env.VITE_AUTOMATION_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8765/api/automation";

export class AutomationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AutomationApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `Automation request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { detail?: string };
      message = payload.detail ?? message;
    } catch {
      // Preserve the fallback message when the service returns non-JSON output.
    }
    throw new AutomationApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function getAutomationHealth() {
  return request<AutomationHealth>("/health");
}

export function getAutomationJobs() {
  return request<AutomationJob[]>("/jobs");
}

export function getAutomationRuns() {
  return request<AutomationRun[]>("/runs");
}

export function getRunLogs(runId: string, after = 0) {
  return request<{ offset: number; content: string; has_more: boolean }>(
    `/runs/${encodeURIComponent(runId)}/logs?after=${after}`,
  );
}

export function runAutomationJob(
  jobId: string,
  options: JobOptions = {},
  confirmed = false,
) {
  return request<AutomationRun>(`/jobs/${encodeURIComponent(jobId)}/runs`, {
    method: "POST",
    body: JSON.stringify({ options, confirmed }),
  });
}

export function startDailyPipeline(options: { headed: boolean; force: boolean }) {
  return request<AutomationRun>("/pipelines/daily/runs", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function resumeAutomationRun(runId: string) {
  return request<AutomationRun>(`/runs/${encodeURIComponent(runId)}/resume`, {
    method: "POST",
  });
}

export function cancelAutomationRun(runId: string) {
  return request<AutomationRun>(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
}

export function startAutomationLogin(provider: "jc2" | "cxalloy") {
  return request<AutomationRun>(`/logins/${provider}`, { method: "POST" });
}

export function continueAutomationLogin(runId: string) {
  return request<AutomationRun>(`/runs/${encodeURIComponent(runId)}/continue`, {
    method: "POST",
  });
}

export function getDailyReports() {
  return request<DailyReport[]>("/daily-reports");
}

export function getDailyReport(reportName: string) {
  return request<DailyReport>(`/daily-reports/${encodeURIComponent(reportName)}`);
}

export function validateDailyReport(payload: {
  failed: string;
  retested_and_passed: string;
  tested: string;
}) {
  return request<DailyReportValidation>("/daily-reports/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveDailyReport(
  reportName: string,
  payload: {
    failed: string;
    retested_and_passed: string;
    tested: string;
    overwrite: boolean;
  },
) {
  return request<SavedDailyReport>(`/daily-reports/${encodeURIComponent(reportName)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

