import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { CxalloyEquipmentLink } from "../types/data";
import { fetchJson, unwrapRecords } from "../utils/dataLoaders";
import { buildCxalloyEquipmentIndex } from "../utils/cxalloyEquipment";

const CxalloyEquipmentLinksContext = createContext(new Map<string, string>());
const RequestCxalloyLinksContext = createContext<(() => void) | null>(null);

export function CxalloyEquipmentLinksProvider({ children, records, refreshKey }: {
  children: ReactNode;
  records?: CxalloyEquipmentLink[];
  refreshKey?: string;
}) {
  const [loaded, setLoaded] = useState<{ refreshKey?: string; records: CxalloyEquipmentLink[] }>({ records: [] });
  const [requested, setRequested] = useState(false);
  const requestLinks = useCallback(() => setRequested(true), []);
  useEffect(() => {
    if (records || !requested) return;
    let active = true;
    setLoaded({ refreshKey, records: [] });
    void fetchJson<unknown>("/data/cxalloy_equipment_links.json").then((payload) => {
      if (active) setLoaded({ refreshKey, records: unwrapRecords<CxalloyEquipmentLink>(payload) });
    }).catch(() => { if (active) setLoaded({ refreshKey, records: [] }); });
    return () => { active = false; };
  }, [records, refreshKey, requested]);
  const index = useMemo(() => buildCxalloyEquipmentIndex(records
    ?? (loaded.refreshKey === refreshKey ? loaded.records : [])), [records, loaded, refreshKey]);
  return <RequestCxalloyLinksContext.Provider value={requestLinks}>
    <CxalloyEquipmentLinksContext.Provider value={index}>{children}</CxalloyEquipmentLinksContext.Provider>
  </RequestCxalloyLinksContext.Provider>;
}

export function useCxalloyEquipmentLinks(): Map<string, string> {
  const requestLinks = useContext(RequestCxalloyLinksContext);
  useEffect(() => { requestLinks?.(); }, [requestLinks]);
  return useContext(CxalloyEquipmentLinksContext);
}
