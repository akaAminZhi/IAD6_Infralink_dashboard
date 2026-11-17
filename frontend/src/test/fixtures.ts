import type { DashboardData, LayoutCableRecord, LayoutPlanManifest } from "../types/data";

export function makeLayoutCable(overrides: Partial<LayoutCableRecord> = {}): LayoutCableRecord {
  return {
    cable_id: "FDR-IAD06-EQ-1-IAD06-EQ-2", equipment_type: "Feeder Cable - LV",
    source_equipment_key: "EQ-1", target_equipment_key: "EQ-2", connection_status: "endpoint_not_on_layout",
    system_element_status: null, neta_complete: false, neta_test_report: null,
    mv_daily_test_status: null, mv_daily_test_date: null, ...overrides,
  };
}

export function makeLayoutManifest(cables: LayoutCableRecord[]): LayoutPlanManifest {
  return { generated_at: "2026-11-17", selected_input_files: {}, floors: [], fixed_equipment: [], cables, diagnostics: [] };
}

export function makeDashboardData(
  overrides: Partial<DashboardData> = {},
): DashboardData {
  return {
    pdms: [],
    equipment: [],
    cases: [],
    moduleEquipmentLinks: [],
    summary: null,
    dataQualityReport: null,
    etlRunMetadata: null,
    historyComparison: null,
    epsTestSummary: null,
    epsDailyReportAudit: null,
    epsPdmExecution: [],
    epsModuleExecution: [],
    epsTestItems: [],
    epsFailedItems: [],
    epsIncompleteItems: [],
    epsNotFoundItems: [],
    issueAttachmentManifest: null,
    netaReportManifest: null,
    cxalloyReportStatus: null,
    powerPlanManifest: null,
    kprSummary: null,
    ...overrides,
  };
}
