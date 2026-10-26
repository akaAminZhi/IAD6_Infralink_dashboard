import type { DashboardResource } from "../types/dashboardResources";

export const dashboardResourceFiles: Record<DashboardResource, string> = {
  pdms: "pdms.json",
  equipment: "equipment.json",
  cases: "cases.json",
  moduleEquipmentLinks: "module_equipment_links.json",
  summary: "summary.json",
  dataQualityReport: "data_quality_report.json",
  etlRunMetadata: "etl_run_metadata.json",
  historyComparison: "history_comparison.json",
  epsTestSummary: "eps_test_summary.json",
  epsDailyReportAudit: "eps_daily_report_audit.json",
  epsPdmExecution: "eps_pdm_execution.json",
  epsModuleExecution: "eps_module_execution.json",
  epsTestItems: "eps_test_items.json",
  epsFailedItems: "eps_failed_items.json",
  epsIncompleteItems: "eps_incomplete_items.json",
  epsNotFoundItems: "eps_not_found_items.json",
  issueAttachmentManifest: "issue_attachment_manifest.json",
  netaReportManifest: "neta_report_manifest.json",
  cxalloyReportStatus: "cxalloy_report_status.json",
  powerPlanManifest: "power_plan.json",
  kprSummary: "kpr_summary.json",
};

const overview: DashboardResource[] = [
  "pdms", "summary", "historyComparison", "epsTestSummary", "epsPdmExecution", "cxalloyReportStatus",
];
const power: DashboardResource[] = ["pdms", "equipment", "cases", "epsModuleExecution", "epsTestItems"];

// Include every dataset used by filters/status calculations before rendering them.
// Report and attachment consumers request their own resources separately.
export function getRouteResources(pathname: string, search = ""): DashboardResource[] {
  let resources: DashboardResource[];
  switch (pathname) {
    case "/pdms": resources = ["pdms", "epsPdmExecution"]; break;
    case "/equipment": resources = [
      "pdms", "equipment", "cases", "epsTestItems", "cxalloyReportStatus", "netaReportManifest", "historyComparison",
    ]; break;
    case "/power-plan": resources = power; break;
    case "/mv-equipment": resources = [...power, "powerPlanManifest"]; break;
    case "/layout":
    case "/data-operations": resources = []; break;
    case "/issues": resources = ["pdms", "equipment", "cases", "historyComparison"]; break;
    case "/data-quality": resources = ["cases", "epsTestItems", "dataQualityReport"]; break;
    case "/kpr": resources = ["kprSummary"]; break;
    case "/eps-test-execution": resources = [
      "epsTestSummary", "epsDailyReportAudit", "epsPdmExecution", "epsModuleExecution", "epsTestItems",
      "epsFailedItems", "epsIncompleteItems", "epsNotFoundItems",
    ]; break;
    default: resources = overview;
  }
  const params = new URLSearchParams(search);
  if (["/equipment", "/issues", "/eps-test-execution"].includes(pathname) &&
      ["kprFilter", "lifecycleStage", "lifecycleTransition"].some((key) => params.has(key))) {
    return [...resources, "kprSummary"];
  }
  return resources;
}
