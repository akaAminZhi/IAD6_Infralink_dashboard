/** Mirror upload_cxalloy_reports.py's default family exclusions and R-zone exception. */
export function isDefaultCxalloyUploadExcluded(equipmentId: string | null | undefined): boolean {
  const target = (equipmentId ?? "").trim().toUpperCase().replace(/^IAD0?6-/, "");
  for (const family of ["TX-CUPP6", "TX-UPP6", "UPP6", "CUPP6"]) {
    if (target !== family && !target.startsWith(`${family}-`)) continue;
    const zone = target.slice(family.length).replace(/^-+/, "").split("-", 1)[0];
    if ((family === "CUPP6" || family === "TX-CUPP6") && /^\d*R$/.test(zone)) return false;
    return true;
  }
  return false;
}
