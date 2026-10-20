import { createContext, useContext, useEffect, type ReactNode } from "react";

import type { DashboardResource, DashboardResourceLoader } from "../types/dashboardResources";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";

const DashboardResourcesContext = createContext<DashboardResourceLoader | null>(null);
export const DashboardResourcesProvider = DashboardResourcesContext.Provider;

export function useDashboardResources(resources: readonly DashboardResource[], enabled = true) {
  const loader = useContext(DashboardResourcesContext);
  const resourceKey = resources.join(",");
  const loadResources = loader?.loadResources;
  useEffect(() => {
    if (enabled && loadResources) {
      void loadResources(resourceKey.split(",").filter(Boolean) as DashboardResource[]);
    }
  }, [enabled, loadResources, resourceKey, loader?.resourceStatus]);
  const error = enabled && resources.some((key) => loader?.resourceStatus[key] === "error");
  const loading = enabled && !!loader && resources.some((key) => !["loaded", "error"].includes(loader.resourceStatus[key] ?? ""));
  return {
    loading,
    error,
    retry: () => { void loadResources?.(resources, true); },
  };
}

export function DashboardResourceBoundary({ resources, children }: {
  resources: readonly DashboardResource[];
  children: ReactNode;
}) {
  const { loading, error, retry } = useDashboardResources(resources);
  if (error) return <ErrorState message="Detail data could not be loaded." onRetry={retry} />;
  if (loading) return <LoadingState />;
  return <>{children}</>;
}
