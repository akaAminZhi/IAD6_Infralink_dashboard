import { memo } from "react";
import type { LayoutCableRecord } from "../../types/data";
import { LAYOUT_CABLE_TEST_STATES, layoutCableTestState } from "../../utils/cableTestUtils";

export const LayoutCable = memo(function LayoutCable({ cable, path, route, zone, selected, active, dimmed, selectionMode, onSelect }: {
  cable: LayoutCableRecord;
  path: string;
  route: "arc" | "long";
  zone: "fixed" | "mixed" | "room";
  selected: boolean;
  active: boolean;
  dimmed: boolean;
  selectionMode: boolean;
  onSelect: (cableId: string) => void;
}) {
  const stateKey = layoutCableTestState(cable), state = LAYOUT_CABLE_TEST_STATES[stateKey];
  const lineWidth = active ? 5.3 : zone === "fixed" ? 3.3 : zone === "mixed" ? 2.8 : 2.5;
  const lineOpacity = active || zone === "fixed" ? 1 : zone === "mixed" ? 0.76 : route === "long" ? 0.62 : 0.78;
  return <g role="button" tabIndex={selectionMode ? -1 : 0} data-cable-id={cable.cable_id}
    aria-label={`${cable.cable_id}: ${state.label}`} aria-pressed={selected}
    opacity={dimmed ? 0.1 : active ? 1 : 0.85} className="cursor-pointer outline-none focus:drop-shadow-md"
    data-cable-route={route} data-cable-zone={zone} pointerEvents={selectionMode ? "none" : undefined}
    onClick={() => onSelect(cable.cable_id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(cable.cable_id); } }}>
    <title>{`${cable.source_equipment_key} → ${cable.target_equipment_key}\n${cable.cable_id}\n${state.label}`}</title>
    {active ? <path d={path} fill="none" stroke="white" strokeWidth={8.5} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
    <path d={path} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
    <path d={path} fill="none" stroke={state.color} strokeWidth={lineWidth} strokeDasharray={state.dash}
      opacity={lineOpacity} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
      pointerEvents="none" data-cable-state={stateKey} />
  </g>;
});
