import type { NetaReportFileRecord, NetaReportManifest } from "../types/data";

const naturalReportCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

export interface NetaReportLink {
  sourceKey: string;
  sourceLabel: string;
  url: string;
  fileName: string;
  reportStage: "temporary" | "formal";
}

export type NetaReportNameMode = "original" | "gc";

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeReportKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getRecordMatchKeys(record: NetaReportFileRecord): string[] {
  return [
    record.report_name,
    record.source_report_name,
    record.relative_path?.split(/[\\/]/).pop(),
  ]
    .map(normalizeReportKey)
    .filter(Boolean);
}

function getSourceOrder(record: NetaReportFileRecord): number {
  return String(record.source_key ?? "") === "downloaded" ? 0 : 1;
}

export function sortNetaReportNames(reportNames: string[]): string[] {
  return [...reportNames].sort((a, b) => naturalReportCollator.compare(a, b));
}

export function getNetaReportNames(value: string | null | undefined): string[] {
  if (isBlank(value)) {
    return [];
  }

  return sortNetaReportNames(
    String(value)
      .split(/[;\r\n]+/)
      .map((report) => report.trim())
      .filter(Boolean),
  );
}

export function getNetaReportCount(value: string | null | undefined): number {
  return getNetaReportNames(value).length;
}

export function getEquipmentNetaReportNames(
  value: string | null | undefined,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): string[] {
  const excelNames = getNetaReportNames(value);
  const publishedNames = getPublishedNetaReportNames(manifest, equipmentId);
  if (!publishedNames?.length) return excelNames;

  const namesByKey = new Map<string, string>();
  for (const name of [...excelNames, ...publishedNames]) {
    const key = normalizeReportKey(name);
    if (!namesByKey.has(key)) namesByKey.set(key, name);
  }
  return sortNetaReportNames([...namesByKey.values()]);
}

function getPublishedNetaReportNames(
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): string[] | undefined {
  const key = normalizeReportKey(equipmentId);
  const active = key ? manifest?.completed_report_revisions?.[key] : undefined;
  return Array.isArray(active) ? active : undefined;
}

export function withPublishedNetaReports<T extends {
  equipment_id?: string | null;
  neta_complete?: boolean | string | null;
  neta_test_report?: string | null;
}>(
  equipment: T, manifest: NetaReportManifest | null,
): T {
  if (!getPublishedNetaReportNames(manifest, equipment.equipment_id)?.length) return equipment;
  const names = getEquipmentNetaReportNames(equipment.neta_test_report, manifest, equipment.equipment_id);
  return {
    ...equipment,
    neta_test_report: names.join("; "),
    ...(equipment.neta_complete === true && { neta_report_status: "report_available" }),
  };
}

export function getNetaReportLinks(
  reportName: string,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): NetaReportLink[] {
  return resolveNetaReportLinks(reportName, manifest, equipmentId).map(({ link }) => link);
}

/** The GC copy behind a JC2 report name, using the same ownership rules as its link. */
export function getGcReportRecord(
  reportName: string,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): NetaReportFileRecord | null {
  return resolveNetaReportLinks(reportName, manifest, equipmentId)
    .find(({ link }) => link.sourceKey === "gc")?.record ?? null;
}

function resolveNetaReportLinks(
  reportName: string,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): { link: NetaReportLink; record: NetaReportFileRecord }[] {
  const lookupKey = normalizeReportKey(reportName);
  if (!lookupKey || !manifest?.records?.length) {
    return [];
  }

  const equipmentKey = normalizeReportKey(equipmentId);
  const candidates = manifest.records.filter((record) => record.url && getRecordMatchKeys(record).includes(lookupKey));
  const owners = new Set(candidates.map((record) => normalizeReportKey(record.equipment_id)).filter(Boolean));
  // Old manifests may omit ownership. Only use those records when ownership is unambiguous.
  const scoped = candidates.filter((record) => {
    const owner = normalizeReportKey(record.equipment_id);
    if (!equipmentKey) return owners.size <= 1;
    // Shared cable PDFs can live under either endpoint's equipment directory.
    // An exact full asset ID as the original PDF basename is explicit evidence.
    if (normalizeReportKey(record.source_report_name).replace(/\.pdf$/i, "") === equipmentKey) return true;
    return owner ? owner === equipmentKey : owners.size === 0 || (owners.size === 1 && owners.has(equipmentKey));
  });
  const identity = (record: NetaReportFileRecord) => [
    normalizeReportKey(record.equipment_id), record.source_key,
    normalizeReportKey(record.source_report_name || record.report_name),
  ].join("\0");
  const formalKeys = new Set(scoped.filter((record) => record.report_stage !== "temporary").map(identity));
  const seenUrls = new Set<string>();
  const links = scoped
    .filter((record) => record.report_stage !== "temporary" || !formalKeys.has(identity(record)))
    .sort((a, b) => {
      return (
        getSourceOrder(a) - getSourceOrder(b) ||
        Number(a.report_stage === "temporary") - Number(b.report_stage === "temporary") ||
        String(a.source_label ?? "").localeCompare(String(b.source_label ?? "")) ||
        String(a.report_name ?? "").localeCompare(String(b.report_name ?? ""))
      );
    })
    .flatMap((record) => {
      const url = String(record.url ?? "").trim();
      if (!url || seenUrls.has(url)) {
        return [];
      }
      seenUrls.add(url);

      return [{
        record,
        link: {
          sourceKey: String(record.source_key ?? "report"),
          sourceLabel: String(record.source_label ?? "Report"),
          url,
          fileName: String(record.report_name ?? reportName),
          reportStage: record.report_stage ?? "formal",
        },
      }];
    });

  return links;
}

export function hasGcNetaReportLinks(
  reportNames: string[],
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): boolean {
  return reportNames.some((reportName) =>
    getNetaReportLinks(reportName, manifest, equipmentId).some((link) => link.sourceKey === "gc"),
  );
}
