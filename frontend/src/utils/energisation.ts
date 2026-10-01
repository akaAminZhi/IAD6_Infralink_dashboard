import type { PdmRecord } from "../types/data";

export type EnergisationStage = "offsite" | "onsite";

// Central color interface for the Power plan marker and its legend.
export const ENERGISATION_COLORS: Record<EnergisationStage, string> = {
  offsite: "#eab308",
  onsite: "#ef4444",
};

export function getEnergisationStage(pdm: PdmRecord | undefined): EnergisationStage | null {
  if (pdm?.energised_onsite === true) return "onsite";
  if (pdm?.energised_offsite === true) return "offsite";
  return null;
}

export function getEnergisationLabel(stage: EnergisationStage): string {
  return stage === "onsite" ? "Energised Onsite" : "Energised Offsite";
}
