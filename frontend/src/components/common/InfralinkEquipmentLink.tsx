import { ExternalLink } from "lucide-react";

import { useInfralinkEquipmentLinks } from "../../contexts/InfralinkEquipmentLinksContext";
import { getInfralinkEquipmentUrl } from "../../utils/infralinkEquipment";

export function InfralinkEquipmentLink({ equipmentId, matchStatus }: {
  equipmentId?: string | null;
  matchStatus?: string | null;
}) {
  const index = useInfralinkEquipmentLinks();
  const url = matchStatus === "ambiguous" ? null : getInfralinkEquipmentUrl(index, equipmentId);
  return url ? (
    <a className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      href={url} target="_blank" rel="noopener noreferrer" title={`Open ${equipmentId} in Infralink`}>
      Open in Infralink <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : <span className="mt-2 block text-xs text-muted-foreground" title="No unique Infralink device ID is available for this equipment.">Infralink link unavailable</span>;
}
