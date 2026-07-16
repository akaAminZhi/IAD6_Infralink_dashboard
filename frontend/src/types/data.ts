export interface SourceFileMetadata {
  path?: string;
  file_name?: string;
  modified_at?: string;
}

export type SourceFileMap = Record<string, SourceFileMetadata | null | undefined>;

export interface RecordsEnvelope<T> {
  source_file?: SourceFileMetadata | null;
  source_files?: SourceFileMap;
  selected_input_files?: SourceFileMap;
  generated_at?: string;
  records?: T[];
  [key: string]: unknown;
}

export interface CaseIssue {
  case_id?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  summary?: string | null;
  system_element_raw?: string | null;
  equipment_id?: string | null;
  match_status?: string | null;
  issue_image?: string | null;
  corrective_images?: string | null;
  reported_on?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  customer?: string | null;
  contract?: string | null;
  created_at?: string | null;
  last_updated_at?: string | null;
  billing_type?: string | null;
}

export interface Equipment {
  equipment_id?: string | null;
  equipment_type?: string | null;
  status?: string | null;
  parent?: string | null;
  system?: string | null;
  open_issues_count_from_system_elements?: number | null;
  neta_complete?: boolean | string | null;
  neta_completed_at?: string | null;
  neta_test_report?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  [key: string]: unknown;
}

export interface ModuleEquipmentLink {
  pdm_name?: string | null;
  module_type?: string | null;
  length?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  weight?: string | number | null;
  source_equipment_column?: string | null;
  source_equipment_label?: string | null;
  normalized_equipment_id?: string | null;
  matched_equipment_id?: string | null;
  match_status?: string | null;
  [key: string]: unknown;
}

export interface PdmEquipmentRecord {
  equipment_id?: string | null;
  source_equipment_label?: string | null;
  match_status?: string | null;
  equipment_type?: string | null;
  status?: string | null;
  parent?: string | null;
  system?: string | null;
  open_issues_count_from_system_elements?: number | null;
  calculated_open_case_count?: number | null;
  neta_complete?: boolean | string | null;
  neta_completed_at?: string | null;
  neta_test_report?: string | null;
  neta_report_status?: string | null;
  neta_validation_status?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  cases?: CaseIssue[];
  [key: string]: unknown;
}

export interface PdmRecord {
  pdm_name?: string | null;
  module_type?: string | null;
  length?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  weight?: string | number | null;
  equipment_count?: number;
  matched_equipment_count?: number;
  unmatched_equipment_count?: number;
  open_case_count?: number;
  total_case_count?: number;
  urgent_case_count?: number;
  high_priority_case_count?: number;
  neta_complete_count?: number;
  neta_incomplete_count?: number;
  neta_missing_report_count?: number;
  equipment?: PdmEquipmentRecord[];
  [key: string]: unknown;
}

export interface DashboardSummary {
  generated_at?: string;
  selected_input_files?: SourceFileMap;
  total_pdms?: number;
  total_pdm_equipment_links?: number;
  total_unique_matched_equipment?: number;
  total_unmatched_module_equipment?: number;
  total_cases?: number;
  total_cases_with_issue_image?: number;
  total_cases_missing_issue_image?: number;
  open_cases?: number;
  urgent_cases?: number;
  high_priority_cases?: number;
  neta_complete_count?: number;
  neta_incomplete_count?: number;
  neta_missing_report_count?: number;
  neta_completion_rate?: number;
  pdms_with_open_cases?: number;
  pdms_with_missing_neta_reports?: number;
  cases_by_status?: Record<string, number>;
  cases_by_priority?: Record<string, number>;
  pdms_by_module_type?: Record<string, number>;
  top_pdms_by_open_cases?: Array<Record<string, unknown>>;
  top_pdms_by_missing_neta_reports?: Array<Record<string, unknown>>;
  top_pdms_by_unmatched_equipment?: Array<Record<string, unknown>>;
  equipment_by_type?: Record<string, number>;
  equipment_by_parent?: Record<string, number>;
  neta_report_status_by_pdm?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface DataQualityReport {
  generated_at?: string;
  selected_input_files?: SourceFileMap;
  unmatched_module_equipment?: ModuleEquipmentLink[];
  unmatched_cases?: CaseIssue[];
  cases_missing_issue_image?: Array<Record<string, unknown>>;
  closed_cases_missing_corrective_images?: Array<Record<string, unknown>>;
  neta_completed_but_missing_test_report?: Array<Record<string, unknown>>;
  neta_test_report_present_but_not_complete?: Array<Record<string, unknown>>;
  open_issue_count_mismatches?: Array<Record<string, unknown>>;
  duplicate_equipment_ids?: Array<Record<string, unknown>>;
  blank_required_fields?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface EtlRunMetadata {
  generated_at?: string;
  selected_input_files?: SourceFileMap;
  output_files?: SourceFileMap;
  record_counts?: Record<string, number>;
  data_quality_counts?: Record<string, number>;
  [key: string]: unknown;
}

export interface NetaReportFileRecord {
  source_key?: string | null;
  source_label?: string | null;
  equipment_id?: string | null;
  report_name?: string | null;
  source_report_name?: string | null;
  relative_path?: string | null;
  url?: string | null;
  bytes?: number | null;
  modified_at?: string | null;
}

export interface NetaReportManifest {
  generated_at?: string;
  source_directories?: Record<string, Record<string, unknown>>;
  public_links?: Record<string, Record<string, unknown>>;
  records?: NetaReportFileRecord[];
  [key: string]: unknown;
}

export interface IssueAttachmentFileRecord {
  case_id?: string | null;
  field?: string | null;
  file_name?: string | null;
  relative_path?: string | null;
  url?: string | null;
  attachment_kind?: "image" | "pdf" | "file" | string | null;
  bytes?: number | null;
  modified_at?: string | null;
}

export interface IssueAttachmentManifest {
  generated_at?: string;
  source_directory?: Record<string, unknown>;
  public_link?: Record<string, unknown>;
  records?: IssueAttachmentFileRecord[];
  [key: string]: unknown;
}

export interface PowerPlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PowerPlanAnnotation {
  annotation_id: string;
  kind: "equipment" | "region" | string;
  annotation_type?: string | null;
  label: string;
  subject?: string | null;
  author?: string | null;
  rect: PowerPlanRect;
  center: { x: number; y: number };
  normalized_equipment_key?: string | null;
  matched_equipment_id?: string | null;
  match_status?: string | null;
}

export interface PowerPlanPageRecord {
  page_id: string;
  document_name: string;
  page_number: number;
  page_label: string;
  width: number;
  height: number;
  annotations: PowerPlanAnnotation[];
}

export interface PowerPlanManifest {
  generated_at?: string;
  source_directory?: string;
  source_files?: SourceFileMetadata[];
  page_count?: number;
  equipment_annotation_count?: number;
  matched_equipment_annotation_count?: number;
  pages?: PowerPlanPageRecord[];
}

export interface HistoryComparisonNetaComplete {
  available?: boolean;
  current_date?: string | null;
  baseline_date?: string | null;
  target_days?: number;
  current_count?: number;
  baseline_count?: number;
  new_count?: number;
  new_equipment_ids?: string[];
  new_equipment_records?: Array<Record<string, unknown>>;
  previous_period?: {
    available?: boolean;
    current_date?: string | null;
    baseline_date?: string | null;
    new_count?: number;
  };
}

export interface HistoryComparisonCases {
  available?: boolean;
  current_date?: string | null;
  baseline_date?: string | null;
  target_days?: number;
  current_count?: number;
  baseline_count?: number;
  new_count?: number;
  new_case_ids?: string[];
  new_cases?: CaseIssue[];
  resolved_count?: number;
  resolved_case_ids?: string[];
  resolved_cases?: CaseIssue[];
  previous_period?: {
    available?: boolean;
    current_date?: string | null;
    baseline_date?: string | null;
    new_count?: number;
    resolved_count?: number;
  };
}

export interface HistoryComparison {
  generated_at?: string;
  lookback_days?: number;
  selected_input_files?: SourceFileMap;
  baseline_input_files?: SourceFileMap;
  previous_baseline_input_files?: SourceFileMap;
  neta_complete?: HistoryComparisonNetaComplete;
  cases?: HistoryComparisonCases;
  [key: string]: unknown;
}

export interface EpsTestTrendWindow {
  available?: boolean;
  source?: string;
  snapshot_diff_available?: boolean;
  current_date?: string | null;
  baseline_date?: string | null;
  source_date_label?: string | null;
  target_days?: number;
  new_tested_count?: number;
  new_failed_count?: number;
  repaired_count?: number;
  new_complete_module_count?: number;
  new_waiting_infralink_neta_count?: number;
  new_failed_module_count?: number;
  new_tested_equipment?: string[];
  new_failed_equipment?: string[];
  repaired_equipment?: string[];
  [key: string]: unknown;
}

export interface EpsDailyHistoryEntry {
  date: string;
  daily_passed_count?: number;
  daily_failed_count?: number;
  daily_passed_equipment?: string[];
  daily_failed_equipment?: string[];
  daily_fixed_count?: number;
  daily_fixed_equipment?: string[];
  cumulative_passed_count?: number;
  cumulative_failed_count?: number;
  cumulative_passed_equipment?: string[];
  cumulative_failed_equipment?: string[];
  cumulative_fixed_count?: number;
  cumulative_fixed_equipment?: string[];
  [key: string]: unknown;
}

export interface EpsDailyHistorySummary {
  available?: boolean;
  source?: string;
  latest_date?: string | null;
  default_current_date?: string | null;
  default_baseline_date?: string | null;
  dates?: string[];
  entries?: EpsDailyHistoryEntry[];
  [key: string]: unknown;
}

export interface EpsTestSummary {
  generated_at?: string;
  selected_input_files?: SourceFileMap;
  snapshot_date?: string;
  source_date_label?: string;
  total_pdm_count?: number;
  total_module_equipment_count?: number;
  total_tracker_test_item_count?: number;
  completed_tracker_test_item_count?: number;
  field_test_completion_rate?: number | null;
  total_tested_equipment_count?: number;
  total_failed_equipment_count?: number;
  failed_test_item_count?: number;
  incomplete_test_item_count?: number;
  test_item_count?: number;
  passed_test_item_count?: number;
  fixed_test_item_count?: number;
  tested_test_item_count?: number;
  not_tested_test_item_count?: number;
  not_found_test_item_count?: number;
  pdu_feeder_breaker_alias_match_count?: number;
  status_counts?: Record<string, number>;
  complete_count?: number;
  waiting_infralink_neta_count?: number;
  partial_count?: number;
  failed_count?: number;
  not_started_count?: number;
  no_tracker_record_count?: number;
  yesterday?: EpsTestTrendWindow;
  seven_day?: EpsTestTrendWindow;
  previous_seven_day?: EpsTestTrendWindow;
  daily_history?: EpsDailyHistorySummary;
  top_pdms_by_failed?: EpsPdmExecutionRecord[];
  top_pdms_by_partial?: EpsPdmExecutionRecord[];
  top_pdms_waiting_infralink_neta?: EpsPdmExecutionRecord[];
  [key: string]: unknown;
}

export interface EpsPdmExecutionRecord {
  pdm_name?: string | null;
  eps_execution_status?: string | null;
  module_equipment_count?: number;
  started_module_equipment_count?: number;
  complete_count?: number;
  waiting_infralink_neta_count?: number;
  partial_count?: number;
  failed_count?: number;
  not_started_count?: number;
  no_tracker_record_count?: number;
  tracker_item_count?: number;
  completed_test_item_count?: number;
  failed_test_item_count?: number;
  field_test_completion_rate?: number | null;
  [key: string]: unknown;
}

export interface EpsModuleExecutionRecord {
  row_id?: string | null;
  pdm_name?: string | null;
  module_equipment?: string | null;
  module_equipment_key?: string | null;
  matched_equipment_id?: string | null;
  match_status?: string | null;
  source_equipment_column?: string | null;
  eps_test_status?: string | null;
  tracker_item_count?: number;
  completed_test_item_count?: number;
  incomplete_test_item_count?: number;
  failed_test_item_count?: number;
  field_test_completion_rate?: number | null;
  neta_complete?: boolean | string | null;
  neta_test_report?: string | null;
  equipment_serial_number?: string | null;
  equipment_manufacturer?: string | null;
  equipment_model?: string | null;
  tracker_types?: string[];
  [key: string]: unknown;
}

export interface EpsTestItemRecord {
  item_status?: string | null;
  source_status?: string | null;
  pdm_name?: string | null;
  module_equipment?: string | null;
  module_equipment_key?: string | null;
  matched_equipment_id?: string | null;
  equipment_name?: string | null;
  equipment_key?: string | null;
  tracker_row?: number | string | null;
  tracker_type?: string | null;
  tracker_equipment_type?: string | null;
  follow_up_req?: string | null;
  comments?: string | null;
  date_tested?: string | null;
  report_reviewed?: string | null;
  retested_and_passed?: boolean;
  retested_at?: string | null;
  equipment_serial_number?: string | null;
  equipment_manufacturer?: string | null;
  equipment_model?: string | null;
  neta_complete?: boolean | string | null;
  neta_test_report?: string | null;
  status?: string | null;
  alias_checked?: string | null;
  module_match_status?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface DashboardData {
  pdms: PdmRecord[];
  equipment: Equipment[];
  cases: CaseIssue[];
  moduleEquipmentLinks: ModuleEquipmentLink[];
  summary: DashboardSummary | null;
  dataQualityReport: DataQualityReport | null;
  etlRunMetadata: EtlRunMetadata | null;
  historyComparison: HistoryComparison | null;
  epsTestSummary: EpsTestSummary | null;
  epsPdmExecution: EpsPdmExecutionRecord[];
  epsModuleExecution: EpsModuleExecutionRecord[];
  epsTestItems: EpsTestItemRecord[];
  epsFailedItems: EpsTestItemRecord[];
  epsIncompleteItems: EpsTestItemRecord[];
  epsNotFoundItems: EpsTestItemRecord[];
  issueAttachmentManifest: IssueAttachmentManifest | null;
  netaReportManifest: NetaReportManifest | null;
  powerPlanManifest: PowerPlanManifest | null;
}
