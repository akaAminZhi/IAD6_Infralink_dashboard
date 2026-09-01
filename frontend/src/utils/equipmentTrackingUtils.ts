interface EquipmentTrackingReference {
  equipment_id?: unknown;
  source_equipment_label?: unknown;
  matched_equipment_id?: unknown;
  normalized_equipment_id?: unknown;
  module_equipment?: unknown;
  test_tracking_required?: unknown;
}

const EXCLUDED_TRACKING_TOKENS = ["BATTERY", "UPS6", "MBC"];
const DIRECT_INVERTER_PREFIX = "INV6";

function referenceRequiresTracking(value: unknown): boolean {
  const reference = String(value ?? "").trim().toUpperCase();
  if (EXCLUDED_TRACKING_TOKENS.some((token) => reference.includes(token))) {
    return false;
  }

  const withoutProjectPrefix = reference.startsWith("IAD06-")
    ? reference.slice("IAD06-".length)
    : reference;
  return !(
    withoutProjectPrefix === DIRECT_INVERTER_PREFIX ||
    withoutProjectPrefix.startsWith(`${DIRECT_INVERTER_PREFIX}-`)
  );
}

export function requiresEquipmentTestTracking(
  equipment: EquipmentTrackingReference,
): boolean {
  if (equipment.test_tracking_required === false) {
    return false;
  }

  return [
    equipment.equipment_id,
    equipment.source_equipment_label,
    equipment.matched_equipment_id,
    equipment.normalized_equipment_id,
    equipment.module_equipment,
  ].every(referenceRequiresTracking);
}
