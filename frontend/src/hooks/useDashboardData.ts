import { useCallback, useEffect, useState } from "react";

import type {
  CaseIssue,
  CxalloyReportStatusManifest,
  DashboardData,
  DashboardSummary,
  DataQualityReport,
  Equipment,
  EtlRunMetadata,
  EpsModuleExecutionRecord,
  EpsPdmExecutionRecord,
  EpsTestItemRecord,
  EpsTestSummary,
  HistoryComparison,
  IssueAttachmentManifest,
  ModuleEquipmentLink,
  NetaReportManifest,
  PdmRecord,
  PowerPlanManifest,
} from "../types/data";
import { fetchJson, unwrapRecords } from "../utils/dataLoaders";

interface DashboardDataState extends DashboardData {
  detailDataError: string | null;
  detailDataLoaded: boolean;
  detailDataLoading: boolean;
  loadDetailData: () => Promise<void>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const emptyDashboardData: DashboardData = {
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
};

async function fetchOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await fetchJson<T>(path);
  } catch (error) {
    console.warn(`Optional dashboard data could not be loaded: ${path}`, error);
    return null;
  }
}

export function useDashboardData(): DashboardDataState {
  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [detailDataLoading, setDetailDataLoading] = useState(false);
  const [detailDataLoaded, setDetailDataLoaded] = useState(false);
  const [detailDataError, setDetailDataError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setDetailDataLoaded(false);
    setDetailDataError(null);
    setReloadToken((token) => token + 1);
  }, []);

  const loadDetailData = useCallback(async () => {
    if (detailDataLoaded || detailDataLoading) {
      return;
    }

    setDetailDataLoading(true);
    setDetailDataError(null);

    try {
      const [equipmentJson, casesJson, moduleLinksJson, dataQualityReport] = await Promise.all([
        fetchJson<unknown>("/data/equipment.json"),
        fetchJson<unknown>("/data/cases.json"),
        fetchJson<unknown>("/data/module_equipment_links.json"),
        fetchJson<DataQualityReport>("/data/data_quality_report.json"),
      ]);

      setData((currentData) => ({
        ...currentData,
        equipment: unwrapRecords<Equipment>(equipmentJson),
        cases: unwrapRecords<CaseIssue>(casesJson),
        moduleEquipmentLinks: unwrapRecords<ModuleEquipmentLink>(moduleLinksJson),
        dataQualityReport,
      }));
      setDetailDataLoaded(true);
    } catch (loadError) {
      console.warn("Dashboard detail data loading failed", loadError);
      setDetailDataError("Equipment and issue detail data could not be loaded.");
    } finally {
      setDetailDataLoading(false);
    }
  }, [detailDataLoaded, detailDataLoading]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [
          pdmsJson,
          summary,
          etlRunMetadata,
          historyComparison,
          epsTestSummary,
          epsPdmExecutionJson,
          epsModuleExecutionJson,
          epsTestItemsJson,
          epsFailedItemsJson,
          epsIncompleteItemsJson,
          epsNotFoundItemsJson,
          issueAttachmentManifest,
          netaReportManifest,
          cxalloyReportStatus,
          powerPlanManifest,
        ] = await Promise.all([
          fetchJson<unknown>("/data/pdms.json"),
          fetchJson<DashboardSummary>("/data/summary.json"),
          fetchJson<EtlRunMetadata>("/data/etl_run_metadata.json"),
          fetchOptionalJson<HistoryComparison>("/data/history_comparison.json"),
          fetchOptionalJson<EpsTestSummary>("/data/eps_test_summary.json"),
          fetchOptionalJson<unknown>("/data/eps_pdm_execution.json"),
          fetchOptionalJson<unknown>("/data/eps_module_execution.json"),
          fetchOptionalJson<unknown>("/data/eps_test_items.json"),
          fetchOptionalJson<unknown>("/data/eps_failed_items.json"),
          fetchOptionalJson<unknown>("/data/eps_incomplete_items.json"),
          fetchOptionalJson<unknown>("/data/eps_not_found_items.json"),
          fetchOptionalJson<IssueAttachmentManifest>("/data/issue_attachment_manifest.json"),
          fetchOptionalJson<NetaReportManifest>("/data/neta_report_manifest.json"),
          fetchOptionalJson<CxalloyReportStatusManifest>("/data/cxalloy_report_status.json"),
          fetchOptionalJson<PowerPlanManifest>("/data/power_plan.json"),
        ]);

        if (!active) {
          return;
        }

        setData({
          pdms: unwrapRecords<PdmRecord>(pdmsJson),
          equipment: [],
          cases: [],
          moduleEquipmentLinks: [],
          summary,
          dataQualityReport: null,
          etlRunMetadata,
          historyComparison,
          epsTestSummary,
          epsPdmExecution: unwrapRecords<EpsPdmExecutionRecord>(epsPdmExecutionJson),
          epsModuleExecution: unwrapRecords<EpsModuleExecutionRecord>(epsModuleExecutionJson),
          epsTestItems: unwrapRecords<EpsTestItemRecord>(epsTestItemsJson),
          epsFailedItems: unwrapRecords<EpsTestItemRecord>(epsFailedItemsJson),
          epsIncompleteItems: unwrapRecords<EpsTestItemRecord>(epsIncompleteItemsJson),
          epsNotFoundItems: unwrapRecords<EpsTestItemRecord>(epsNotFoundItemsJson),
          issueAttachmentManifest,
          netaReportManifest,
          cxalloyReportStatus,
          powerPlanManifest,
        });
        setDetailDataLoaded(false);
        setDetailDataError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        console.warn("Dashboard data loading failed", loadError);
        setError("Dashboard data could not be loaded.");
        setData(emptyDashboardData);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  return {
    ...data,
    detailDataError,
    detailDataLoaded,
    detailDataLoading,
    loading,
    error,
    loadDetailData,
    reload,
  };
}
