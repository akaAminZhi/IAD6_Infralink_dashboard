import type { DashboardData } from "../types/data";

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
