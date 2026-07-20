import type { EpsTestItemRecord } from "../../types/data";
import {
  getEpsTestItemStatusLabel,
  getEpsStatusTone,
  summarizeEpsTestItems,
} from "../../utils/epsTestItemUtils";
import { formatDateTime, formatNumber } from "../../utils/formatters";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

interface EpsTestItemsPanelProps {
  items: EpsTestItemRecord[];
}

export function EpsExecutionBadge({ items }: EpsTestItemsPanelProps) {
  const summary = summarizeEpsTestItems(items);
  const label = summary.status === "Fixed" ? "Fixed After Failure" : summary.status;
  return <StatusBadge tone={getEpsStatusTone(summary.status)}>{label}</StatusBadge>;
}

export function EpsTestItemsPanel({ items }: EpsTestItemsPanelProps) {
  const summary = summarizeEpsTestItems(items);

  if (items.length === 0) {
    return (
      <EmptyState
        description="No EPS tracker test items are linked to this equipment."
        title="No EPS test items found"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <EpsExecutionBadge items={items} />
        <span className="text-xs text-muted-foreground">
          {formatNumber(summary.total)} test {summary.total === 1 ? "item" : "items"}
        </span>
        {summary.passed > 0 ? (
          <span className="text-xs font-medium text-emerald-700">
            {formatNumber(summary.passed)} passed
          </span>
        ) : null}
        {summary.fixed > 0 ? (
          <span className="text-xs font-medium text-teal-700">
            {formatNumber(summary.fixed)} fixed after failure
          </span>
        ) : null}
        {summary.failed > 0 ? (
          <span className="text-xs font-medium text-red-700">
            {formatNumber(summary.failed)} failed
          </span>
        ) : null}
        {summary.remaining > 0 ? (
          <span className="text-xs font-medium text-amber-700">
            {formatNumber(summary.remaining)} remaining
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Test Item</th>
              <th className="px-3 py-2 font-medium">Tracker Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Date Tested</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const itemStatus = String(item.item_status ?? item.status ?? "Unknown");
              const itemStatusLabel = getEpsTestItemStatusLabel(itemStatus);
              const itemSummary = summarizeEpsTestItems([{ ...item, item_status: itemStatus }]);
              return (
                <tr
                  className="border-b align-top last:border-0"
                  key={`${item.equipment_key ?? item.equipment_name ?? "test-item"}-${item.tracker_row ?? index}-${index}`}
                >
                  <td className="px-3 py-2 font-medium">
                    {item.equipment_name ?? item.equipment_key ?? "Unnamed test item"}
                  </td>
                  <td className="px-3 py-2">{item.tracker_type ?? item.tracker_equipment_type ?? "--"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={getEpsStatusTone(itemSummary.status)}>
                      {itemStatusLabel}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">{formatDateTime(item.date_tested)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
