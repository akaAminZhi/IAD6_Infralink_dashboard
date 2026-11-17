import { CheckCircle2, Circle, FileCheck2, PlugZap } from "lucide-react";
import { connectedCableCounts, equipmentEnergizationReadiness, getConnectedCableScope, type ConnectedCableIndex } from "../../utils/connectedCables";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { EnergizationReadyBadge } from "./EnergizationReadyBadge";

export function EnergizationReadinessPanel({ equipment, cableIndex }: { equipment: FlattenedEquipmentRow; cableIndex: ConnectedCableIndex | null }) {
  const readiness = equipmentEnergizationReadiness(equipment, cableIndex);
  const scope = getConnectedCableScope(equipment, cableIndex);
  const counts = cableIndex ? connectedCableCounts(scope.cables, cableIndex) : null;
  const hasScope = !!counts && (counts.total > 0 || scope.excludedCount > 0);
  const gates = [
    { label: "Equipment NETA", complete: equipment.neta_complete === true, detail: equipment.neta_complete === true ? "Complete" : "Not confirmed" },
    { label: "Cables tested", complete: hasScope && counts?.tested === counts?.total, detail: counts?.total ? `${counts.tested} of ${counts.total} tested` : hasScope ? "None required" : "Scope not confirmed" },
    { label: "Cable reports", complete: hasScope && counts?.withReport === counts?.total, detail: counts?.total ? `${counts.withReport} of ${counts.total} available` : hasScope ? "None required" : "Scope not confirmed" },
  ];
  return <section aria-label="Energization readiness" className="equipment-readiness">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2"><PlugZap className="h-5 w-5 text-[#204778]" aria-hidden="true" />Energization readiness</h3>
      <EnergizationReadyBadge equipment={equipment} cableIndex={cableIndex} />
    </div>
    {readiness.status !== "not_applicable" ? <div className="equipment-readiness-gates">
      {gates.map((gate, index) => {
        const Icon = gate.complete ? CheckCircle2 : index === 2 ? FileCheck2 : Circle;
        return <div key={gate.label} className="flex items-start gap-2.5">
          <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${gate.complete ? "text-green-700" : "text-slate-400"}`} />
          <div><p className="text-sm font-medium">{gate.label}</p><p className="mt-1 text-xs text-muted-foreground">{gate.detail}</p></div>
        </div>;
      })}
    </div> : null}
    <p className="mt-3 max-w-[75ch] text-xs leading-relaxed text-muted-foreground">{readiness.reason}</p>
  </section>;
}
