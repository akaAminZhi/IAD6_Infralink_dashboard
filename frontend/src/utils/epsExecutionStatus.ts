

export const STATUS_COMPLETE = "Complete";
export const STATUS_WAITING_INFRALINK_NETA = "Complete, Waiting Infralink NETA Completion";
export const STATUS_FAILED = "Failed";
export const STATUS_PARTIAL = "Partial";
export const STATUS_NOT_STARTED = "Not Started";
export const STATUS_NO_TRACKER_RECORDS = "No Tracker Records";
export const STATUS_NOT_TRACKED = "Not Tracked";

export function statusSortValue(status: unknown): number {
  if (status === STATUS_FAILED) {
    return 0;
  }
  if (status === STATUS_PARTIAL) {
    return 1;
  }
  if (status === STATUS_WAITING_INFRALINK_NETA) {
    return 2;
  }
  if (status === STATUS_COMPLETE) {
    return 3;
  }
  if (status === STATUS_NOT_STARTED) {
    return 4;
  }
  return 5;
}

export function testItemSortValue(status: unknown): number {
  if (status === "Failed - Not In Tracker") {
    return 0;
  }
  if (status === STATUS_FAILED) {
    return 1;
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return 2;
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return 3;
  }
  if (status === "Passed - Not In Tracker") {
    return 4;
  }
  if (status === "Passed") {
    return 5;
  }
  if (status === "Not Found In Tracker") {
    return 6;
  }
  return 7;
}
