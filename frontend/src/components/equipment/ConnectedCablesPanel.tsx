import { useRef, useState } from "react";
import { Cable, CircleAlert, FileCheck2, X } from "lucide-react";
import { LAYOUT_CABLE_TEST_STATES, layoutCableTestState } from "../../utils/cableTestUtils";
import { cableHasReport, connectedCableCounts, connectedEquipmentKey, getConnectedCableScope, type ConnectedCableIndex } from "../../utils/connectedCables";
import type { FlattenedEquipmentRow } from "../../utils/equipmentUtils";
import { getLayoutCableReportNames } from "../../utils/layoutReportUtils";
import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { DailyTestHistory } from "../common/DailyTestHistory";
import { EquipmentExternalLinks } from "../common/EquipmentExternalLinks";
import { EquipmentUpdateInfo } from "../common/EquipmentUpdateInfo";
import { NetaReportChips } from "../common/NetaReportChips";
import { FeederCableAtpReports } from "../layout/FeederCableAtpReports";
import { CableInspector } from "./CableInspector";

export function ConnectedCablesPanel({ equipment, cableIndex }: { equipment: FlattenedEquipmentRow; cableIndex: ConnectedCableIndex | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const manifest = useNetaReportManifest();
  if (!cableIndex) return <p className="text-sm text-amber-800">Connected cable data unavailable. Refresh Layout data and reload.</p>;
  const { cables, excludedCount } = getConnectedCableScope(equipment, cableIndex);
  const counts = connectedCableCounts(cables, cableIndex);
  const selected = cables.find((cable) => cable.cable_id === selectedId);
  const selectedReports = selected ? getLayoutCableReportNames(selected, manifest) : [];
  return <section ref={panelRef} aria-label="Connected cables" className="space-y-3" onClick={(event) => event.stopPropagation()}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Cable className="h-4 w-4 text-[#204778]" aria-hidden="true" />Connected cables ({cables.length})</h3>
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-y py-2.5 text-xs tabular-nums" aria-label="Connected cable test counts">
      <span className="text-green-700">Tested: {counts.tested}</span>
      <span className="text-red-700">Test failed: {counts.failed}</span>
      <span className="text-slate-600">Testing not confirmed: {counts.unconfirmed}</span>
      <span>With reports: {counts.withReport}/{counts.total}</span>
    </div>
    {excludedCount > 0 ? <p className="text-xs text-muted-foreground">{excludedCount} connection(s) excluded by the cable scope rules.</p> : null}
    <div className="divide-y" aria-label="Connected cable list">
      {cables.map((cable) => {
        const state = LAYOUT_CABLE_TEST_STATES[layoutCableTestState(cable)];
        const other = connectedEquipmentKey(cable.source_equipment_key) === connectedEquipmentKey(equipment.equipment_id ?? equipment.display_equipment_id)
          ? cable.target_equipment_key : cable.source_equipment_key;
        const reportAvailable = cableHasReport(cable, cableIndex);
        const ReportIcon = reportAvailable ? FileCheck2 : CircleAlert;
        return <div key={cable.cable_id}
          className={`grid w-full cursor-default grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-2 py-3 text-left ${selectedId === cable.cable_id ? "bg-blue-50" : ""}`}>
          <div role="button" tabIndex={0} aria-label={`View cable details for ${cable.cable_id}`} aria-expanded={selectedId === cable.cable_id}
            className="col-span-2 cursor-pointer select-text space-y-1 rounded text-[#204778] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              // A drag selects the ID for copying; an ordinary click opens details.
              if (!window.getSelection()?.toString()) {
                event.currentTarget.focus({ preventScroll: true });
                setSelectedId(cable.cable_id);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(cable.cable_id);
              }
            }}>
            <span className="block cursor-pointer select-text break-all text-sm font-semibold">{other ?? "Unresolved endpoint"}</span>
            <span className="block cursor-pointer select-text break-all text-xs">{cable.cable_id}</span>
          </div>
          <span className="block text-xs" style={{ color: state.color }}>{state.label}</span>
          <span className={`flex items-center justify-end gap-1 text-right text-xs ${reportAvailable ? "text-green-700" : "text-amber-800"}`}>
            <ReportIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {reportAvailable ? "Report available" : "Report missing"}
          </span>
          {cable.feeder_cable_atp_files?.length ? <span className="block text-xs text-blue-700">Feeder Cable ATP PDF</span> : null}
        </div>;
      })}
    </div>
    {!cables.length ? <p className="text-xs text-muted-foreground">{excludedCount
      ? "No connected cables require testing or reports under the cable scope rules."
      : "No feeder cable references this equipment ID."}</p> : null}
    {selected ? <CableInspector key={selected.cable_id} anchor={panelRef.current} onClose={() => setSelectedId(null)}>
      <section key={selected.cable_id} aria-label="Cable details" className="space-y-3">
      <h3 className="text-sm font-semibold">Cable connection</h3>
      <div className="flex items-start justify-between gap-2"><h4 className="cursor-text select-text break-all text-sm font-semibold">{selected.cable_id}</h4>
        <button type="button" aria-label="Close cable details" className="rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedId(null)}><X className="h-4 w-4" aria-hidden="true" /></button></div>
      <EquipmentExternalLinks equipmentId={selected.cable_id} />
      <p className="text-sm font-medium" style={{ color: LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selected)].color }}>{LAYOUT_CABLE_TEST_STATES[layoutCableTestState(selected)].label}</p>
      <p className="break-all text-xs">From: {selected.source_equipment_key ?? "Unresolved"}<br />To: {selected.target_equipment_key ?? "Unresolved"}</p>
      <p className="text-xs">Infralink: {selected.system_element_status ?? "Unknown"}</p>
      <p className="text-xs">NETA: {selected.neta_complete ? "Complete" : "Not confirmed"}</p>
      <p className="text-xs">EPS daily: {selected.eps_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selected.eps_daily_test_date ? ` (${selected.eps_daily_test_date})` : ""}</p>
      <p className="text-xs">MV daily: {selected.mv_daily_test_status?.replace(/_/g, " ") ?? "No test evidence"}{selected.mv_daily_test_date ? ` (${selected.mv_daily_test_date})` : ""}</p>
      {!cableHasReport(selected, cableIndex) ? <p className="text-xs font-medium text-amber-800">Report missing. No Feeder Cable ATP or cable NETA report is listed.</p> : null}
      <EquipmentUpdateInfo updated_by={selected.updated_by} updated_at={selected.updated_at} />
      <DailyTestHistory events={selected.daily_report_history} conflict={selected.daily_report_conflict} />
      <FeederCableAtpReports files={selected.feeder_cable_atp_files ?? []} names={selected.feeder_cable_atp_names ?? []} required={selected.feeder_cable_atp_required ?? false} />
      {selectedReports.length ? <NetaReportChips equipmentId={selected.cable_id} reports={selectedReports} showLinkedFileNames stackedCompact /> : null}
      </section>
    </CableInspector> : null}
  </section>;
}
