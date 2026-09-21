import type {
  NetaReportReview,
  NetaReportReviewsResponse,
} from "../types/automation";
import type { NetaReportFileRecord, NetaReportManifest } from "../types/data";
import { getNetaReportNames } from "./equipmentUtils";

export type EquipmentNetaReviewState = "passed" | "failed" | "review_required";

const manifestIndexes = new WeakMap<NetaReportManifest, Map<string, Set<string>>>();
const reviewIndexes = new WeakMap<NetaReportReviewsResponse, Map<string, Set<number>>>();

function manifestIndex(manifest: NetaReportManifest | null) {
  if (!manifest) return new Map<string, Set<string>>();
  let index = manifestIndexes.get(manifest);
  if (!index) {
    index = new Map();
    for (const record of manifest.records ?? []) {
      const keys = recordKeys(record);
      for (const key of keys) {
        const aliases = index.get(key) ?? new Set<string>();
        keys.forEach((alias) => aliases.add(alias));
        index.set(key, aliases);
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
): NetaReportReview[] {
  if (!reviews?.reports.length) {
    return [];
  }

  const lookupKey = normalizeReportKey(reportName);
  const lookupBaseName = baseName(reportName);
  const candidates = new Set([lookupKey, lookupBaseName].filter(Boolean));
  const aliases = manifestIndex(manifest);
  for (const key of [lookupKey, lookupBaseName]) {
    aliases.get(key)?.forEach((alias) => candidates.add(alias));
  }

  const indexedReviews = reviewIndex(reviews);
  const positions = new Set<number>();
  candidates.forEach((key) =>
    indexedReviews.get(key)?.forEach((position) => positions.add(position)),
  );
  return [...positions].sort((a, b) => a - b).map((position) => reviews.reports[position]);
}

export function getNetaReviewsForEquipment(
  reportValue: string | null | undefined,
  reviews: NetaReportReviewsResponse | null,
  manifest: NetaReportManifest | null,
): NetaReportReview[] {
  const seen = new Set<string>();
  return getNetaReportNames(reportValue).flatMap((reportName) =>
    getNetaReviewsForReport(reportName, reviews, manifest).filter((review) => {
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
): EquipmentNetaReviewState | null {
  const matched = getNetaReviewsForEquipment(reportValue, reviews, manifest);
  if (matched.some((review) => review.status === "FAILED")) {
    return "failed";
  }
  if (matched.some((review) => review.status === "REVIEW_REQUIRED" || review.status === "ERROR")) {
    return "review_required";
  }
  return matched.some((review) => review.status === "PASSED") ? "passed" : null;
}
