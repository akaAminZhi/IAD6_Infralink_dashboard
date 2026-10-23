import { getEquipmentCableAtpNames, type FlattenedEquipmentRow } from "../../utils/equipmentUtils";

export function EquipmentCableAtpEvidence({ equipment }: { equipment: FlattenedEquipmentRow }) {
  const names = getEquipmentCableAtpNames(equipment);
  if (!names.length) return null;
  return <section aria-label="Cable completion evidence" className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
    <h4 className="font-medium text-green-900">Feeder Cable ATP</h4>
    <p className="text-xs text-green-800">Attached in Infralink · cable test completion confirmed.</p>
    <ul className="space-y-1 text-xs text-green-950">{names.map((name, index) => <li className="break-all" key={`${name}-${index}`}>{name}</li>)}</ul>
  </section>;
}
