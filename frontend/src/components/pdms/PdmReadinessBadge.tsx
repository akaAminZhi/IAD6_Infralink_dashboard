import { StatusBadge } from "../common/StatusBadge";
import type { PdmReadinessLevel } from "../../utils/pdmUtils";

interface PdmReadinessBadgeProps {
  level: PdmReadinessLevel;
}

const toneByLevel: Record<PdmReadinessLevel, "success" | "warning" | "danger" | "default" | "muted"> = {
  "Not Started": "muted",
  Good: "success",
  Watch: "default",
  Attention: "warning",
  Critical: "danger",
};

export function PdmReadinessBadge({ level }: PdmReadinessBadgeProps) {
  return <StatusBadge tone={toneByLevel[level]}>{level}</StatusBadge>;
}
