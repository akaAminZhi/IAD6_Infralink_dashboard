import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { InfralinkEquipmentLink } from "../types/data";
import { fetchJson, unwrapRecords } from "../utils/dataLoaders";
import { buildInfralinkEquipmentIndex } from "../utils/infralinkEquipment";

const InfralinkEquipmentLinksContext = createContext(new Map<string, string>());
const RequestInfralinkLinksContext = createContext<(() => void) | null>(null);

export function InfralinkEquipmentLinksProvider({ children, records, refreshKey }: {
  children: ReactNode;
  records?: InfralinkEquipmentLink[];
  refreshKey?: string;
}) {
  const [loadedRecords, setLoadedRecords] = useState<InfralinkEquipmentLink[]>([]);
  const [requested, setRequested] = useState(false);
  const requestLinks = useCallback(() => setRequested(true), []);
  useEffect(() => {
    if (records || !requested) return;
    let active = true;
    setLoadedRecords([]);
    void fetchJson<unknown>("/data/infralink_equipment_links.json").then((payload) => {
      if (active) setLoadedRecords(unwrapRecords<InfralinkEquipmentLink>(payload));
    }).catch(() => { if (active) setLoadedRecords([]); });
    return () => { active = false; };
  }, [records, refreshKey, requested]);
  const index = useMemo(() => buildInfralinkEquipmentIndex(records ?? loadedRecords), [records, loadedRecords]);
  return <RequestInfralinkLinksContext.Provider value={requestLinks}>
    <InfralinkEquipmentLinksContext.Provider value={index}>{children}</InfralinkEquipmentLinksContext.Provider>
  </RequestInfralinkLinksContext.Provider>;
}

export function useInfralinkEquipmentLinks(): Map<string, string> {
  const requestLinks = useContext(RequestInfralinkLinksContext);
  useEffect(() => { requestLinks?.(); }, [requestLinks]);
  return useContext(InfralinkEquipmentLinksContext);
}
