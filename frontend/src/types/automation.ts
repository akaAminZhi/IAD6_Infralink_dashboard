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
  owner_user_id?: string | null;
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
  busy?: boolean;
  session_scope?: "personal";
  service_status: "ok";
  dashboard_root: string;
  eps_tracker_root: string;
  eps_tracker_exists: boolean;
  report_directory: string;
  mv_report_directory: string;
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

export interface BrowserLoginSession {
  session_id: string;
  provider: "jc2" | "cxalloy";
  status: "starting" | "ready" | "saved" | "closed" | "failed";
  error: string | null;
  image?: string;
  width: number;
  height: number;
  blocked_host?: string | null;
}

export type BrowserLoginAction =
  | { kind: "screen" | "save" }
  | { kind: "click"; x: number; y: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: string }
  | { kind: "scroll"; delta: number };

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

export interface MvDailyReportSections {
  tested_and_passed: string[];
  partially_tested: string[];
  failed: string[];
  retested_and_passed: string[];
}

export interface MvDailyReport {
  report_name: string;
  modified_at: string;
  sections: MvDailyReportSections;
  counts: Record<keyof MvDailyReportSections, number>;
}

export interface MvDailyReportValidation {
  sections: MvDailyReportSections;
  counts: Record<keyof MvDailyReportSections, number>;
  warnings: Array<{
    item: string;
    removed_from: string;
    kept_in: string;
  }>;
}

export interface SavedMvDailyReport {
  report: MvDailyReport;
  validation: MvDailyReportValidation;
}

export type TestSite = "onsite" | "offsite";
export interface SiteDailyReport {
  report_name: string;
  site: TestSite;
  modified_at: string;
  sections: { tested_and_passed: string[]; failed: string[]; retested_and_passed: string[] };
  counts: { tested_and_passed: number; failed: number; retested_and_passed: number };
}
export interface SavedSiteDailyReport {
  report: SiteDailyReport;
  wash_run: AutomationRun | null;
  rebuild_error: string | null;
}

export interface MvEquipmentComment {
  comment_id: string;
  annotation_id: string;
  text: string;
  created_at: string;
}

export interface MvEquipmentCommentsResponse {
  comments: MvEquipmentComment[];
}

export type NetaReportReviewStatus =
  | "PASSED"
  | "FAILED"
  | "REVIEW_REQUIRED"
  | "ERROR";

export interface NetaReportReview {
  file: string;
  status: NetaReportReviewStatus;
  is_passed: boolean | null;
  evidence?: string[];
  manual_review?: {
    status?: "PASSED" | "FAILED";
    reviewed_at?: string;
  } | null;
}

export interface NetaReportReviewsResponse {
  available?: boolean;
  published_at?: string;
  generated_at?: string | null;
  last_reviewed_at?: string | null;
  total_reports: number;
  summary: Record<NetaReportReviewStatus, number>;
  reports: NetaReportReview[];
}
