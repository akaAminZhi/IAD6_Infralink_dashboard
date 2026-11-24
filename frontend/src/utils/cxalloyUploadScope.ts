/** Mirror upload_cxalloy_reports.py's default family exclusions and R-zone exception. */
export function isDefaultCxalloyUploadExcluded(equipmentId: string | null | undefined): boolean {
  const target = (equipmentId ?? "").trim().toUpperCase().replace(/^IAD0?6-/, "");
  for (const family of ["TX-CUPP6", "CUPP6"]) {
    if (target !== family && !target.startsWith(`${family}-`)) continue;
    const zone = target.slice(family.length).replace(/^-+/, "").split("-", 1)[0];
    return !/^\d*R$/.test(zone);
  }
  return false;
}
