import { CxalloyEquipmentLink } from "./CxalloyEquipmentLink";
import { InfralinkEquipmentLink } from "./InfralinkEquipmentLink";

export function EquipmentExternalLinks(props: { equipmentId?: string | null; matchStatus?: string | null }) {
  return <div className="flex flex-wrap items-center gap-x-4">
    <InfralinkEquipmentLink {...props} />
    <CxalloyEquipmentLink {...props} />
  </div>;
}
