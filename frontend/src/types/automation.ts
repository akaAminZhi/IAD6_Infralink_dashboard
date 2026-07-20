export type AutomationRunStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "auth_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AutomationRunStep {
  job_id: string;
  label: string;
  status: AutomationRunStatus | "pending";
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
}

export interface AutomationRun {
  run_id: string;
  kind: "job" | "pipeline" | "login";
  label: string;
  status: AutomationRunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  current_step: string | null;
  options: Record<string, unknown>;
  steps: AutomationRunStep[];
}

export interface AutomationJob {
  job_id: string;
  label: string;
  description: string;
  supported_options: string[];
  dangerous: boolean;
}

export interface SessionStatus {
  exists: boolean;
  modified_at: string | null;
}

export interface AutomationHealth {
  service_status: "ok";
  dashboard_root: string;
  eps_tracker_root: string;
  eps_tracker_exists: boolean;
  report_directory: string;
  runtime_directory: string;
  sessions: {
    jc2: SessionStatus;
    cxalloy: SessionStatus;
  };
  active_run_id: string | null;
  last_etl: {
    path: string;
    generated_at: string | null;
    readable: boolean;
  } | null;
}

export interface JobOptions {
  headed?: boolean;
  dry_run?: boolean;
  force?: boolean;
  only?: string[];
  limit?: number | null;
  no_excel_update?: boolean;
}

export interface DailyReportSections {
  failed: string[];
  retested_and_passed: string[];
  tested: string[];
}

export interface DailyReport {
  report_name: string;
  modified_at: string;
  sections: DailyReportSections;
  counts: Record<keyof DailyReportSections, number>;
}

export interface DailyReportValidation {
  sections: DailyReportSections;
  counts: Record<keyof DailyReportSections, number>;
  warnings: Array<{
    item: string;
    removed_from: string;
    kept_in: string;
  }>;
}

export interface SavedDailyReport {
  report: DailyReport;
  validation: DailyReportValidation;
  wash_run: AutomationRun;
}

