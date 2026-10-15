import { memo } from "react";
import type { LayoutCableRecord } from "../../types/data";
import { CABLE_TEST_STATES, cableTestState } from "../../utils/cableTestUtils";

export const LayoutCable = memo(function LayoutCable({ cable, path, route, selected, active, dimmed, selectionMode, onSelect }: {
  cable: LayoutCableRecord;
  path: string;
  route: "arc" | "rounded";
  selected: boolean;
  active: boolean;
  dimmed: boolean;
  selectionMode: boolean;
  onSelect: (cableId: string) => void;
}) {
  const stateKey = cableTestState(cable), state = CABLE_TEST_STATES[stateKey];
  return <g role="button" tabIndex={selectionMode ? -1 : 0} data-cable-id={cable.cable_id}
    aria-label={`${cable.cable_id}: ${state.label}`} aria-pressed={selected}
    opacity={dimmed ? 0.1 : active ? 1 : 0.85} className="cursor-pointer outline-none focus:drop-shadow-md"
    data-cable-route={route} pointerEvents={selectionMode ? "none" : undefined}
    onClick={() => onSelect(cable.cable_id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(cable.cable_id); } }}>
    <title>{`${cable.source_equipment_key} → ${cable.target_equipment_key}\n${cable.cable_id}\n${state.label}`}</title>
    {active ? <path d={path} fill="none" stroke="white" strokeWidth={7} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
    <path d={path} fill="none" stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
    <path d={path} fill="none" stroke={state.color} strokeWidth={active ? 4.5 : 3} strokeDasharray={state.dash}
      vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" data-cable-state={stateKey} />
  </g>;
});
