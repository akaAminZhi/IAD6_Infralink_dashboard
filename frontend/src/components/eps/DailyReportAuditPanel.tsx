import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import type { EpsDailyReportAudit, EpsDailyReportEvent, EpsDailyReportItem } from "../../types/data";
import { matchesSearchQuery } from "../../utils/searchUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "../common/StatusBadge";

const sourceLabels = {
  Daily_test_report: "Daily Test Report",
  MV_Daily_test_report: "MV Daily Test Report",
};
const statusLabels: Record<EpsDailyReportEvent["status"], string> = {
  tested: "Tested / Passed",
  tested_and_passed: "Tested / Passed",
  failed: "Failed",
  retested_and_passed: "Retested and Passed",
};
const inputClass = "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const PAGE_SIZE = 10;
type RepeatReview = "dates" | "sameDay" | "crossSource";

function recentRepeatWindow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  const through = `${part("year")}-${part("month")}-${part("day")}`;
  const start = new Date(`${through}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: start.toISOString().slice(0, 10), through };
}

function latestMatchingRepeatDate(
  item: EpsDailyReportItem, review: RepeatReview, source: string, from: string, through: string,
): string | undefined {
  if (review === "dates" && !item.repeated_on_different_dates) return;
  if (review === "sameDay" && !item.repeated_on_same_day) return;
  if (review === "crossSource" && !item.cross_source) return;
  const dateCounts = new Map<string, number>();
  item.events.forEach((event) => dateCounts.set(event.date, (dateCounts.get(event.date) ?? 0) + 1));
  return item.events.reduce<string | undefined>((latest, event) => {
    const laterDate = event.date > item.test_dates[0];
    const sameDayRepeat = (dateCounts.get(event.date) ?? 0) > 1;
    const isRepeat = review === "dates" ? laterDate
      : review === "sameDay" ? sameDayRepeat : laterDate || sameDayRepeat;
    if (!isRepeat || (source && event.source !== source) ||
        (from && event.date < from) || (through && event.date > through)) return latest;
    return !latest || event.date > latest ? event.date : latest;
  }, undefined);
}

export function DailyReportAuditPanel({ audit }: { audit: EpsDailyReportAudit | null }) {
  const [recentWindow, setRecentWindow] = useState(recentRepeatWindow);
  const [search, setSearch] = useState("");
  const [repeat, setRepeat] = useState<RepeatReview>("dates");
  const [source, setSource] = useState("");
  const [fromDate, setFromDate] = useState(recentWindow.from);
  const [toDate, setToDate] = useState(recentWindow.through);
  const [page, setPage] = useState(1);
  const recordsRef = useRef<HTMLDivElement>(null);
  const recentRepeatCount = useMemo(() => (audit?.items ?? []).filter((item) =>
    latestMatchingRepeatDate(item, "dates", "", recentWindow.from, recentWindow.through),
  ).length, [audit, recentWindow]);
  const filtered = useMemo(() => (audit?.items ?? []).flatMap((item) => {
    if (!matchesSearchQuery([
      item.equipment_key, item.pdm_name, item.module_equipment,
      ...item.events.map((event) => event.report_name),
    ], search)) return [];
    const repeatDate = latestMatchingRepeatDate(item, repeat, source, fromDate, toDate);
    return repeatDate ? [{ item, repeatDate }] : [];
  }).sort((a, b) => b.repeatDate.localeCompare(a.repeatDate) ||
    a.item.equipment_key.localeCompare(b.item.equipment_key)).map(({ item }) => item),
  [audit, fromDate, repeat, search, source, toDate]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => {
    if (recordsRef.current) recordsRef.current.scrollTop = 0;
  }, [currentPage, filtered]);
  const reset = () => {
    const currentWindow = recentRepeatWindow();
    setRecentWindow(currentWindow);
    setSearch(""); setRepeat("dates"); setSource(""); setFromDate(currentWindow.from); setToDate(currentWindow.through); setPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>EPS + MV Daily Reports / Repeat Test Review</CardTitle>
        <CardDescription>
          Repeated Tested / Passed, Failed and Retested and Passed records from EPS and MV daily reports.
          Defaults to repeats recorded in the last 7 days, including today (Eastern Time).
          Repeat candidates use the complete item ID; reports do not identify the test procedure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!audit ? <p className="text-sm text-muted-foreground">Daily report review data is unavailable. Run the EPS execution builder or ETL, then refresh.</p> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(audit.sources).map(([name, details]) => (
              <div className="rounded-md border p-3" key={name}>
                <div className="text-sm font-medium">{sourceLabels[name as keyof typeof sourceLabels]}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {details.available ? `${details.report_count} reports · ${details.event_count} entries` : "Source directory unavailable"}
                </div>
                {details.skipped_files.length > 0 && <p className="mt-1 text-xs text-amber-700">Skipped undated files: {details.skipped_files.join(", ")}</p>}
              </div>
            ))}
            <button className="rounded-md border p-3 text-left hover:bg-muted" onClick={reset} type="button"><div className="text-sm font-medium">Repeated in last 7 days</div><div className="mt-1 text-xl font-semibold">{recentRepeatCount}</div></button>
            <button className="rounded-md border p-3 text-left hover:bg-muted" onClick={() => { setRepeat("dates"); setSearch(""); setSource(""); setFromDate(""); setToDate(""); setPage(1); }} type="button">
              <div className="flex items-center gap-2 text-sm font-medium"><RotateCcw className="h-4 w-4" />All-time repeated items</div>
              <div className="mt-1 text-xl font-semibold">{audit.repeated_item_count}</div>
              <div className="text-xs text-muted-foreground">Same-day repeated entries: {audit.same_day_item_count} items</div>
            </button>
          </div>
          <div className="flex gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>Repeated entries are review candidates, including planned retests and follow-up work. Same-day entries do not establish a later retest. Source and date filters apply to repeat entries; full history stays visible, including earlier tests outside the selected dates. M-D filenames use the file modification year (marked * below). Tracker execution metrics below retain their existing EPS tracker scope.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">Search repeated items
              <input className={inputClass} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Item ID, PDM, report" value={search} />
            </label>
            <label className="flex flex-col gap-1 text-xs">Repeat review
              <select aria-label="Repeat review" className={inputClass} onChange={(event) => { setRepeat(event.target.value as RepeatReview); setPage(1); }} value={repeat}>
                <option value="dates">Repeated on different dates</option>
                <option value="sameDay">Same-day repeated entries</option><option value="crossSource">Appears in both report sources</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">Report source
              <select aria-label="Report source" className={inputClass} onChange={(event) => { setSource(event.target.value); setPage(1); }} value={source}>
                <option value="">Both report sources</option>
                {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">Repeat date from<input className={inputClass} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} type="date" value={fromDate} /></label>
            <label className="flex flex-col gap-1 text-xs">Repeat date through<input className={inputClass} onChange={(event) => { setToDate(event.target.value); setPage(1); }} type="date" value={toDate} /></label>
            <button className={inputClass} onClick={() => { setFromDate(""); setToDate(""); setPage(1); }} type="button">All repeat history</button>
            <button className={inputClass} onClick={reset} type="button">Reset daily review</button>
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} matching repeated items · full report history shown</div>
          <div aria-label="Repeated test records" className="h-[800px] overflow-auto overscroll-contain [overflow-anchor:none]" ref={recordsRef} role="region" tabIndex={0}>
          {visible.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No repeated test items match these filters.</p> :
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b bg-background text-xs uppercase text-muted-foreground"><tr>
                <th className="px-3 py-2">Test item / Equipment ID</th>
                <th className="px-3 py-2">First recorded test</th><th className="px-3 py-2">Later test dates</th><th className="px-3 py-2">Review / History</th>
              </tr></thead>
              <tbody>{visible.map((item) => <tr className="border-b align-top" key={item.equipment_key}>
                <td className="px-3 py-3 font-medium">{item.equipment_key}
                  {!item.test_tracking_required && <div className="mt-1 text-xs text-muted-foreground">Excluded from EPS/NETA tracking</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{item.test_dates[0]}</td>
                <td className="px-3 py-3">{item.test_dates.slice(1).join(", ") || "—"}</td>
                <td className="min-w-[350px] px-3 py-3">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {item.repeated_on_different_dates && <StatusBadge tone="warning">Repeated across dates</StatusBadge>}
                    {item.repeated_on_same_day && <StatusBadge tone="muted">Same-day entries</StatusBadge>}
                    {item.cross_source && <StatusBadge tone="muted">Both sources</StatusBadge>}
                  </div>
                  <details><summary className="cursor-pointer text-primary">Report history ({item.events.length} entries)</summary>
                    <ol className="mt-2 space-y-2">{item.events.map((event, index) => <li className="rounded border p-2 text-xs" key={`${event.source}-${event.report_name}-${event.line_number}-${index}`}>
                      <div className="font-medium">{event.date}{event.date_basis === "filename_month_day_file_year" ? " *" : ""} · {statusLabels[event.status]}</div>
                      <div className="mt-1 text-muted-foreground">{sourceLabels[event.source]} / {event.report_name} · line {event.line_number}</div>
                    </li>)}</ol>
                  </details>
                </td>
              </tr>)}</tbody>
            </table>}
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <button className={inputClass} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} type="button">Previous</button>
            <span>Page {currentPage} / {totalPages} · {PAGE_SIZE} per page</span>
            <button className={inputClass} disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} type="button">Next</button>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
