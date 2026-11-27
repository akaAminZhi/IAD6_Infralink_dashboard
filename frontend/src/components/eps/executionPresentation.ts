import {
  STATUS_COMPLETE, STATUS_FAILED, STATUS_NO_TRACKER_RECORDS, STATUS_NOT_STARTED,
  STATUS_NOT_TRACKED, STATUS_PARTIAL, STATUS_WAITING_INFRALINK_NETA,
} from "../../utils/epsExecutionStatus";

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function formatSnapshotDate(value: string | null | undefined): string {
  if (!value) {
    return "No baseline";
  }

  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }

  return `${Number(parts[1])}/${Number(parts[2])}/${parts[0]}`;
}

export function statusTone(status: string | null | undefined): "default" | "success" | "warning" | "danger" | "muted" {
  if (status === STATUS_COMPLETE) {
    return "success";
  }
  if (status === STATUS_FAILED) {
    return "danger";
  }
  if (status === STATUS_PARTIAL || status === STATUS_WAITING_INFRALINK_NETA) {
    return "warning";
  }
  if (
    status === STATUS_NOT_STARTED ||
    status === STATUS_NO_TRACKER_RECORDS ||
    status === STATUS_NOT_TRACKED
  ) {
    return "muted";
  }
  return "default";
}

export function itemStatusTone(
  status: string | null | undefined,
): "default" | "success" | "teal" | "warning" | "danger" | "muted" {
  if (status === "Passed") {
    return "success";
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return "teal";
  }
  if (status === "Passed - Not In Tracker") {
    return "default";
  }
  if (status === STATUS_FAILED || status === "Failed - Not In Tracker") {
    return "danger";
  }
  if (status === "Not Found In Tracker") {
    return "danger";
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return "warning";
  }
  return "muted";
}

export function itemStatusClass(status: string | null | undefined): string {
  if (status === "Passed") {
    return "border-emerald-200 bg-emerald-50/60";
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return "border-teal-300 bg-teal-50/80";
  }
  if (status === "Passed - Not In Tracker") {
    return "border-blue-200 bg-blue-50/70";
  }
  if (status === STATUS_FAILED || status === "Failed - Not In Tracker") {
    return "border-red-300 bg-red-50/80";
  }
  if (status === "Not Found In Tracker") {
    return "border-red-300 bg-red-50/70";
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return "border-amber-200 bg-amber-50/70";
  }
  return "border-border bg-background";
}
