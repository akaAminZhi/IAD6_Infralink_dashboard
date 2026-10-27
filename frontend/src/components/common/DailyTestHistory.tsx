import type { EpsDailyReportEvent } from "../../types/data";

export function DailyTestHistory({ events, conflict }: { events?: EpsDailyReportEvent[]; conflict?: boolean }) {
  if (!events?.length) return null;
  return <details className="rounded border p-2 text-xs">
    <summary className="cursor-pointer font-medium">Daily report history ({events.length} records)</summary>
    {conflict && <p className="mt-2 text-red-700">Conflicting daily results: failure takes priority until a later passing result.</p>}
    <ol className="mt-2 max-h-64 space-y-2 overflow-auto">{events.map((event, index) => <li className="rounded border p-2" key={`${event.source}-${event.report_name}-${event.line_number}-${index}`}>
      <div>{event.date} · {event.status.replace(/_/g, " ")}</div>
      <div className="text-muted-foreground">{event.site ?? (event.source === "Onsite_Test_Report" ? "onsite" : event.source === "Offsite_Test_Report" ? "offsite" : "legacy")} · {event.source}/{event.report_name} · line {event.line_number}</div>
    </li>)}</ol>
  </details>;
}
