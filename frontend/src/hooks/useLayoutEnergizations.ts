import { useEffect, useMemo, useState } from "react";

import { useOperationsIdentity } from "../components/dataOperations/OperationsAuth";
import type { LayoutManualEnergization } from "../types/data";
import { AutomationApiError, getLayoutEnergizations, saveLayoutEnergization } from "../utils/automationApi";

function mergeRecords(
  previous: ReadonlyMap<string, LayoutManualEnergization> | null, incoming: LayoutManualEnergization[],
) {
  const next = new Map(previous);
  for (const record of incoming) {
    const known = next.get(record.equipment_id);
    if (!known || record.revision >= known.revision) next.set(record.equipment_id, record);
  }
  return next;
}

export function useLayoutEnergizations(published: LayoutManualEnergization[] | undefined, refreshKey: number) {
  const local = useOperationsIdentity() === "local_operator";
  const [live, setLive] = useState<ReadonlyMap<string, LayoutManualEnergization> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ equipmentId: string; message: string } | null>(null);
  const records = useMemo(() => (local && live) || mergeRecords(null, published ?? []), [local, live, published]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    if (!local) return;
    let active = true;
    void getLayoutEnergizations().then(({ records }) => {
      if (!active) return;
      setLive((previous) => mergeRecords(previous, records));
      setLoadError(false);
    }, () => {
      if (active) setLoadError(true);
    });
    return () => { active = false; };
  }, [local, refreshKey, attempt]);

  async function save(equipmentId: string, energized: boolean) {
    if (!local || !live || loadError || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const record = await saveLayoutEnergization(equipmentId, energized, live.get(equipmentId)?.revision ?? 0);
      setLive((previous) => mergeRecords(previous, [record]));
    } catch (error) {
      setSaveError({ equipmentId, message: error instanceof Error ? error.message : "Unable to save energization." });
      if (error instanceof AutomationApiError && error.status === 409) retry();
    } finally {
      setSaving(false);
    }
  }

  return { records, local, canEdit: local && live !== null && !loadError, loadError, saving, saveError, retry, save };
}
