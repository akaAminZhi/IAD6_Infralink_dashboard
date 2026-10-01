import { Zap } from "lucide-react";

import {
  ENERGISATION_COLORS,
  getEnergisationLabel,
  type EnergisationStage,
} from "../../utils/energisation";

export function EnergisationMarker({
  stage,
  x,
  y,
  color = ENERGISATION_COLORS[stage],
}: {
  stage: EnergisationStage;
  x: number;
  y: number;
  color?: string;
}) {
  const label = getEnergisationLabel(stage);
  return (
    <g transform={`translate(${x}, ${y})`} role="img" aria-label={label}>
      <title>{label}</title>
      <Zap
        x={-40}
        y={-40}
        width={80}
        height={80}
        color={color}
        fill={color}
        className="animate-energisation-breathe"
        aria-hidden="true"
      />
    </g>
  );
}
