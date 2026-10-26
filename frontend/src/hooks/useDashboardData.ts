import { useCallback, useEffect, useRef, useState } from "react";

import type { DashboardData } from "../types/data";
import type { DashboardResource, DashboardResourceLoader } from "../types/dashboardResources";
import { clearPendingJsonRequests, fetchJson, unwrapRecords } from "../utils/dataLoaders";
import { dashboardResourceFiles, getRouteResources } from "../utils/dashboardResources";

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
};

const recordResources = new Set<DashboardResource>([
  "pdms", "equipment", "cases", "moduleEquipmentLinks", "epsPdmExecution", "epsModuleExecution",
  "epsTestItems", "epsFailedItems", "epsIncompleteItems", "epsNotFoundItems",
]);
const requiredResources = new Set<DashboardResource>([
  "pdms", "equipment", "cases", "moduleEquipmentLinks", "summary", "etlRunMetadata", "dataQualityReport",
]);

function createCache() {
  return {
    data: emptyDashboardData,
    status: {} as DashboardResourceLoader["resourceStatus"],
    pending: new Map<DashboardResource, Promise<void>>(),
  };
}

export function useDashboardData(pathname = "/overview", search = "") {
  const cacheRef = useRef(createCache());
  const reloadVersion = useRef(0);
  const mounted = useRef(true);
  const [, setRevision] = useState(0);
  const publish = useCallback(() => {
    if (mounted.current) setRevision((revision) => revision + 1);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadResources = useCallback(async (resources: readonly DashboardResource[], retry = false) => {
    const cache = cacheRef.current;
    let started = false;
    const requests = resources.map((key) => {
      const pending = cache.pending.get(key);
      if (pending) return pending;
      if (cache.status[key] === "loaded" || (cache.status[key] === "error" && !retry)) return;
      cache.status = { ...cache.status, [key]: "loading" };
      started = true;
      const request = (async () => {
        // Register the pending request before invoking even a synchronous loader.
        await Promise.resolve();
        try {
          const payload = await fetchJson<unknown>(`/data/${dashboardResourceFiles[key]}`);
          if (payload === null && requiredResources.has(key)) throw new Error(`Missing ${key}`);
          cache.data = { ...cache.data, [key]: recordResources.has(key) ? unwrapRecords(payload) : payload };
          cache.status = { ...cache.status, [key]: "loaded" };
        } catch (error) {
          console.warn(`Dashboard data could not be loaded: ${key}`, error);
          // Optional exports retain their existing empty/unavailable behavior.
          cache.status = { ...cache.status, [key]: requiredResources.has(key) ? "error" : "loaded" };
        } finally {
          cache.pending.delete(key);
          if (cacheRef.current === cache) publish();
        }
      })();
      cache.pending.set(key, request);
      return request;
    });
    if (started) publish();
    await Promise.all(requests);
  }, [publish]);

  const reload = useCallback(() => {
    // Discard the entire previous generation, including late detail responses.
    clearPendingJsonRequests();
    cacheRef.current = createCache();
    reloadVersion.current += 1;
    publish();
  }, [publish]);

  const cache = cacheRef.current;
  const resources = getRouteResources(pathname, search);
  const resourceKey = resources.join(",");
  useEffect(() => {
    // Metadata never blocks a route. All required files start in the same batch.
    void loadResources(["etlRunMetadata", ...resourceKey.split(",").filter(Boolean) as DashboardResource[]]);
  }, [cache, loadResources, resourceKey]);

  const failed = resources.some((key) => cache.status[key] === "error");
  return {
    ...cache.data,
    loading: !failed && resources.some((key) => cache.status[key] !== "loaded"),
    error: failed ? "Dashboard data could not be loaded." : null,
    resourceStatus: cache.status,
    reloadVersion: reloadVersion.current,
    loadResources,
    reload,
  };
}
