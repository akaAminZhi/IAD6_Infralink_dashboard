import type { DashboardData } from "./data";

export type DashboardResource = keyof DashboardData;
export type DashboardResourceStatus = "loading" | "loaded" | "error";

export interface DashboardResourceLoader {
  resourceStatus: Partial<Record<DashboardResource, DashboardResourceStatus>>;
  loadResources: (resources: readonly DashboardResource[], retry?: boolean) => Promise<void>;
}
