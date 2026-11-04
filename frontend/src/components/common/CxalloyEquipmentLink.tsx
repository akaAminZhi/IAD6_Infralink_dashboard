import { ExternalLink } from "lucide-react";

import { useCxalloyEquipmentLinks } from "../../contexts/CxalloyEquipmentLinksContext";
import { getCxalloyEquipmentUrl } from "../../utils/cxalloyEquipment";

export function CxalloyEquipmentLink({ equipmentId, matchStatus }: {
  equipmentId?: string | null;
  matchStatus?: string | null;
}) {
  const index = useCxalloyEquipmentLinks();
  const url = matchStatus === "ambiguous" ? null : getCxalloyEquipmentUrl(index, equipmentId);
  return url ? (
    <a className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      href={url} target="_blank" rel="noopener noreferrer" title={`Open ${equipmentId} in CxAlloy`}>
      Open in CxAlloy <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : <span className="mt-2 block text-xs text-muted-foreground"
    title="No unique CxAlloy equipment ID is available for this equipment.">CxAlloy link unavailable</span>;
}
