import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { InfralinkEquipmentLink } from "../types/data";
import { fetchJson, unwrapRecords } from "../utils/dataLoaders";
import { buildInfralinkEquipmentIndex } from "../utils/infralinkEquipment";

const InfralinkEquipmentLinksContext = createContext(new Map<string, string>());

export function InfralinkEquipmentLinksProvider({ children, records, refreshKey }: {
  children: ReactNode;
  records?: InfralinkEquipmentLink[];
  refreshKey?: string;
}) {
  const [loadedRecords, setLoadedRecords] = useState<InfralinkEquipmentLink[]>([]);
  useEffect(() => {
    if (records) return;
    let active = true;
    void fetchJson<unknown>("/data/infralink_equipment_links.json").then((payload) => {
      if (active) setLoadedRecords(unwrapRecords<InfralinkEquipmentLink>(payload));
    }).catch(() => { if (active) setLoadedRecords([]); });
    return () => { active = false; };
  }, [records, refreshKey]);
  const index = useMemo(() => buildInfralinkEquipmentIndex(records ?? loadedRecords), [records, loadedRecords]);
  return <InfralinkEquipmentLinksContext.Provider value={index}>{children}</InfralinkEquipmentLinksContext.Provider>;
}

export function useInfralinkEquipmentLinks(): Map<string, string> {
  return useContext(InfralinkEquipmentLinksContext);
}
