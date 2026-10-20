import { useDashboardResources } from "./DashboardResourcesContext";
import { createContext, useContext, type ReactNode } from "react";

import type { NetaReportManifest } from "../types/data";

const NetaReportManifestContext = createContext<NetaReportManifest | null>(null);

interface NetaReportManifestProviderProps {
  children: ReactNode;
  manifest: NetaReportManifest | null;
}

export function NetaReportManifestProvider({
  children,
  manifest,
}: NetaReportManifestProviderProps) {
  return (
    <NetaReportManifestContext.Provider value={manifest}>
      {children}
    </NetaReportManifestContext.Provider>
  );
}

export function useNetaReportManifest(enabled = true): NetaReportManifest | null {
  useDashboardResources(["netaReportManifest"], enabled);
  return useContext(NetaReportManifestContext);
}
