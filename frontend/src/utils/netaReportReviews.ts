import type {
  NetaReportReview,
  NetaReportReviewsResponse,
} from "../types/automation";
import type { NetaReportFileRecord, NetaReportManifest } from "../types/data";
import { getNetaReportNames } from "./equipmentUtils";

export type EquipmentNetaReviewState = "passed" | "failed" | "review_required";

const manifestIndexes = new WeakMap<NetaReportManifest, Map<string, Set<NetaReportFileRecord>>>();
const reviewIndexes = new WeakMap<NetaReportReviewsResponse, Map<string, Set<number>>>();

function manifestIndex(manifest: NetaReportManifest | null) {
  if (!manifest) return new Map<string, Set<NetaReportFileRecord>>();
  let index = manifestIndexes.get(manifest);
  if (!index) {
    index = new Map();
    for (const record of manifest.records ?? []) {
      const keys = recordKeys(record);
      for (const key of keys) {
        const records = index.get(key) ?? new Set<NetaReportFileRecord>();
        records.add(record);
        index.set(key, records);
      }
    }
    manifestIndexes.set(manifest, index);
  }
  return index;
}

function reviewIndex(reviews: NetaReportReviewsResponse) {
  let index = reviewIndexes.get(reviews);
  if (!index) {
    index = new Map();
    reviews.reports.forEach((review, position) => {
      for (const key of [normalizeReportKey(review.file), baseName(review.file)]) {
        const positions = index!.get(key) ?? new Set<number>();
        positions.add(position);
        index!.set(key, positions);
      }
    });
    reviewIndexes.set(reviews, index);
  }
  return index;
}

function normalizeReportKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
}

function baseName(value: unknown): string {
  return normalizeReportKey(value).split("/").pop() ?? "";
}

function recordKeys(record: NetaReportFileRecord): string[] {
  return [
    record.report_name,
    record.source_report_name,
    record.relative_path,
    baseName(record.relative_path),
  ]
    .map(normalizeReportKey)
    .filter(Boolean);
}

export function getNetaReviewsForReport(
  reportName: string,
  reviews: NetaReportReviewsResponse | null,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): NetaReportReview[] {
  if (!reviews?.reports.length) {
    return [];
  }

  const lookupKey = normalizeReportKey(reportName);
  const lookupBaseName = baseName(reportName);
  const records = manifestIndex(manifest).get(lookupKey) ?? new Set<NetaReportFileRecord>();
  const owner = normalizeReportKey(equipmentId);
  const owners = new Set([...records].map((record) => normalizeReportKey(record.equipment_id)).filter(Boolean));
  const scoped = [...records].filter((record) => {
    const recordOwner = normalizeReportKey(record.equipment_id);
    // A shared cable can be explicitly named under an endpoint directory.
    if (owner && normalizeReportKey(record.source_report_name).replace(/\.pdf$/i, "") === owner) return true;
    return owner
      ? recordOwner ? recordOwner === owner : owners.size === 0 || owners.size === 1 && owners.has(owner)
      : owners.size <= 1;
  });
  const indexedReviews = reviewIndex(reviews);
  const positions = new Set<number>();
  const addExact = (path: string) => indexedReviews.get(path)?.forEach((position) => {
    if (normalizeReportKey(reviews.reports[position].file) === path) positions.add(position);
  });
  if (records.size) {
    // Resolve aliases to complete paths, never to every review sharing a basename.
    for (const record of scoped) {
      const path = normalizeReportKey(record.relative_path);
      if (path) addExact(path);
      // Legacy review exports can contain a bare filename. It must identify one
      // manifest path globally before it is safe to use for an editable result.
      for (const name of recordKeys(record).filter((key) => !key.includes("/"))) {
        const paths = new Set([...(manifestIndex(manifest).get(name) ?? [])]
          .map((item) => normalizeReportKey(item.relative_path)).filter(Boolean));
        if (paths.size <= 1) addExact(name);
      }
    }
  } else {
    const matches = indexedReviews.get(lookupKey) ?? indexedReviews.get(lookupBaseName);
    // Without manifest evidence, a basename is safe only when unique.
    if (lookupKey.includes("/")) addExact(lookupKey);
    else if (matches?.size === 1) matches.forEach((position) => positions.add(position));
  }
  return [...positions].sort((a, b) => a - b).map((position) => reviews.reports[position]);
}

export function getNetaReviewsForEquipment(
  reportValue: string | null | undefined,
  reviews: NetaReportReviewsResponse | null,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): NetaReportReview[] {
  const seen = new Set<string>();
  return getNetaReportNames(reportValue).flatMap((reportName) =>
    getNetaReviewsForReport(reportName, reviews, manifest, equipmentId).filter((review) => {
      const key = normalizeReportKey(review.file);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }),
  );
}

export function getEquipmentNetaReviewState(
  reportValue: string | null | undefined,
  reviews: NetaReportReviewsResponse | null,
  manifest: NetaReportManifest | null,
  equipmentId?: string | null,
): EquipmentNetaReviewState | null {
  const matched = getNetaReviewsForEquipment(reportValue, reviews, manifest, equipmentId);
  if (matched.some((review) => review.status === "FAILED")) {
    return "failed";
  }
  if (matched.some((review) => review.status === "REVIEW_REQUIRED" || review.status === "ERROR")) {
    return "review_required";
  }
  return matched.some((review) => review.status === "PASSED") ? "passed" : null;
}
