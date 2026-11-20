// Mirrors scripts/etl/build_neta_position_check.py (neta_position_check.json).

export type NetaPositionResult =
  | "pass"
  | "missing"
  | "failed_only"
  | "retest_unordered"
  | "result_pending"
  | "waived"
  | "optional_missing";

export type NetaBaselineBasis = "confirmed" | "draft" | "none";
export type NetaDraftStatus = "draft" | "needs_decision" | "insufficient";

export interface NetaBaselinePosition {
  key: string;
  count: number;
  optional: boolean;
  aliases: string[];
  form?: string;
}

export interface NetaBaselineException {
  waived_positions: string[];
  extra_positions: NetaBaselinePosition[];
  note: string;
}

export interface NetaPositionBaselineInput {
  positions: NetaBaselinePosition[];
  exceptions: Record<string, NetaBaselineException>;
}

export interface NetaConfirmedFamily extends NetaPositionBaselineInput {
  status: "confirmed";
  confirmed_at: string | null;
  confirmed_by: string | null;
}

export interface NetaPositionBaselines {
  version: number;
  revision: number;
  families: Record<string, NetaConfirmedFamily>;
}

export interface NetaPositionReport {
  equipment_id: string;
  file: string;
  url: string;
  report_stage: "temporary" | "formal";
  status: string;
  key: string;
  confidence: "exact" | "normalized" | "alias" | "snapped" | "needs_review";
  form: string;
  source_report_name: string | null;
  flags: string[];
  referenced_equipment: string | null;
  name_source: string;
  gc_name_key: string | null;
  test_date: string | null;
  serial_number?: string | null;
  text_source?: string | null;
  pdf_fields?: Record<string, string>;
  field_votes?: Record<string, string>;
  suggested_gc_name?: string | null;
}

export interface NetaPositionCell {
  key: string;
  result: NetaPositionResult;
  notes: string[];
  reports: string[];
}

export interface NetaPositionEquipment {
  equipment_id: string;
  family: string;
  equipment_type: string | null;
  neta_complete: boolean;
  baseline_basis: NetaBaselineBasis;
  report_stage: string | null;
  report_count: number;
  nonconforming: boolean;
  complete_but_nonconforming: boolean;
  issue_counts: Record<string, number>;
  positions: NetaPositionCell[];
  extra_reports: { file: string; key: string }[];
  needs_review_reports: { file: string; key: string }[];
  reports: NetaPositionReport[];
  exception_note: string | null;
}

export interface NetaPositionFamily {
  family: string;
  members: string[];
  member_count: number;
  neta_complete_count: number;
  draft: {
    status: NetaDraftStatus;
    complete_member_count: number;
    positions: string[];
    support: Record<string, number>;
  };
  confirmed: {
    positions: NetaBaselinePosition[];
    confirmed_at: string | null;
    confirmed_by: string | null;
    exceptions: Record<string, NetaBaselineException>;
  } | null;
  baseline_basis: NetaBaselineBasis;
  baseline_positions: string[];
  draft_differs_from_confirmed: boolean;
  nonconforming_count: number;
}

export interface NetaPositionCheck {
  available: boolean;
  generated_at: string;
  reviews_generated_at?: string | null;
  report_fields_available?: boolean;
  baseline_revision: number;
  summary: {
    families?: number;
    families_confirmed?: number;
    families_draft?: number;
    equipment?: number;
    nonconforming_equipment?: number;
    complete_but_nonconforming?: number;
    equipment_by_issue?: Record<string, number>;
  };
  families: NetaPositionFamily[];
  equipment: NetaPositionEquipment[];
}
