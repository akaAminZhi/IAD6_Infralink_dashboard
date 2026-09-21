import type { NetaReportReviewsResponse } from "../types/automation";
import { getNetaReportReviews } from "./automationApi";

const CACHE_MS = 5 * 60_000;
let cached: { data: NetaReportReviewsResponse; expires: number } | null = null;
let pending: Promise<NetaReportReviewsResponse> | null = null;

export function clearPublishedNetaReviewCache() {
  cached = null;
  pending = null;
}

async function publishedReviews(): Promise<NetaReportReviewsResponse> {
  if (cached && Date.now() < cached.expires) return cached.data;
  if (pending) return pending;
  const request = fetch("/data/neta_report_reviews.json", { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Published NETA review results are unavailable.");
      const data = await response.json() as NetaReportReviewsResponse;
      if (data.available === false || !Array.isArray(data.reports) || !data.summary) {
        throw new Error("Published NETA review results are unavailable.");
      }
      if (pending === request) cached = { data, expires: Date.now() + CACHE_MS };
      return data;
    })
    .finally(() => {
      if (pending === request) pending = null;
    });
  pending = request;
  return request;
}

export async function loadNetaReportReviews(hostname = window.location.hostname) {
  // Remote readers must never contact their own loopback automation service.
  if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
    try {
      return { data: await getNetaReportReviews(), editable: true };
    } catch {
      // Frontend-only local hosting can also use the published snapshot.
    }
  }
  return { data: await publishedReviews(), editable: false };
}
