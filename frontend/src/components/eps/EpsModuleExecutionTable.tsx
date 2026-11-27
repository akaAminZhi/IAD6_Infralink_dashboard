import { ChevronDown } from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import type { EpsModuleExecutionRecord, EpsTestItemRecord } from "../../types/data";
import { countTestItemResults } from "../../utils/epsExecutionBreakdown";
import { moduleGroupKey } from "../../utils/epsExecutionRows";
import { getEpsTestItemStatusLabel } from "../../utils/epsTestItemUtils";
import { formatNumber } from "../../utils/formatters";
import { formatPercent, itemStatusClass, itemStatusTone } from "./executionPresentation";
import { ExpandableComment, StatusPill, TrackerTypeBadge } from "./ExecutionTableCells";

type TrackerTypeSelection = {
  activeTrackerType: string;
  onSelectTrackerType: (trackerType: string) => void;
};

export function EpsModuleExecutionTable({
  modules,
  testItemsByModule,
  hasItemScope,
  expandedModules,
  onToggleModule,
  activeTrackerType,
  onSelectTrackerType,
}: TrackerTypeSelection & {
  modules: EpsModuleExecutionRecord[];
  testItemsByModule: ReadonlyMap<string, EpsTestItemRecord[]>;
  hasItemScope: boolean;
  expandedModules: ReadonlySet<string>;
  onToggleModule: (key: string) => void;
}) {
  const rows = modules.map((record) => {
    const key = moduleGroupKey(record.pdm_name, record.module_equipment_key);
    return { record, key, items: testItemsByModule.get(key) ?? [] };
  }).filter(({ items }) => !hasItemScope || items.length > 0);

  if (rows.length === 0) {
    return <EmptyState title="No module equipment matches the current filters for this PDM." />;
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full min-w-[1060px] text-left text-sm">
        <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Equipment ID or Source Label</th>
            <th className="px-3 py-2 font-medium">EPS Status</th>
            <th className="px-3 py-2 text-right font-medium">Passed</th>
            <th className="px-3 py-2 text-right font-medium">Fixed After Failure</th>
            <th className="px-3 py-2 text-right font-medium">Not Tested</th>
            <th className="px-3 py-2 text-right font-medium">Current Failed</th>
            <th className="px-3 py-2 text-right font-medium">Not In Tracker</th>
            <th className="px-3 py-2 text-right font-medium">Test Items</th>
            <th className="px-3 py-2 text-right font-medium">Completion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ record, key, items }) => (
            <ModuleRow
              key={record.row_id ?? key}
              activeTrackerType={activeTrackerType}
              isExpanded={expandedModules.has(key)}
              items={items}
              onSelectTrackerType={onSelectTrackerType}
              onToggle={() => onToggleModule(key)}
              record={record}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModuleRow({
  record, items, isExpanded, onToggle, activeTrackerType, onSelectTrackerType,
}: TrackerTypeSelection & {
  record: EpsModuleExecutionRecord;
  items: EpsTestItemRecord[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const counts = countTestItemResults(items);

  return (
    <>
      <tr
        className="cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50"
        onClick={onToggle}
      >
        <td className="px-3 py-3 font-medium">
          <div className="flex min-w-0 items-start gap-2">
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                isExpanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            <div className="min-w-0">
              <div className="break-words">
                {record.module_equipment ?? "--"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {record.matched_equipment_id ?? "--"}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          <StatusPill status={record.eps_test_status} />
        </td>
        <td className="px-3 py-3 text-right text-emerald-700">
          {formatNumber(counts.Passed)}
        </td>
        <td className="px-3 py-3 text-right text-teal-700">
          {formatNumber(counts.Fixed)}
        </td>
        <td className="px-3 py-3 text-right text-amber-700">
          {formatNumber(counts["Not Tested"])}
        </td>
        <td className="px-3 py-3 text-right text-red-700">
          {formatNumber(counts.Failed)}
        </td>
        <td className="px-3 py-3 text-right text-blue-700">
          {formatNumber(counts["Not In Tracker"])}
        </td>
        <td className="px-3 py-3 text-right">
          {formatNumber(items.length)}
        </td>
        <td className="px-3 py-3 text-right">
          {formatPercent(record.field_test_completion_rate)}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td className="px-3 py-3" colSpan={9}>
            <ModuleTestItems
              activeTrackerType={activeTrackerType}
              items={items}
              onSelectTrackerType={onSelectTrackerType}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ModuleTestItems({
  items, activeTrackerType, onSelectTrackerType,
}: TrackerTypeSelection & { items: EpsTestItemRecord[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
        No tracker test items found for this module equipment.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b bg-muted/30 uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Test Item</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Tracker Type</th>
            <th className="px-3 py-2 font-medium">Equipment Type</th>
            <th className="px-3 py-2 text-right font-medium">Tracker Row</th>
            <th className="px-3 py-2 font-medium">Comments</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, itemIndex) => (
            <tr
              className={`border-b last:border-0 ${itemStatusClass(item.item_status)}`}
              key={`${item.equipment_key}-${item.tracker_row}-${itemIndex}`}
            >
              <td className="px-3 py-2 font-medium">
                {item.equipment_name ?? item.equipment_key ?? "--"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge tone={itemStatusTone(item.item_status)}>
                  {getEpsTestItemStatusLabel(item.item_status)}
                </StatusBadge>
              </td>
              <td className="px-3 py-2">
                <TrackerTypeBadge
                  activeTrackerType={activeTrackerType}
                  onSelectTrackerType={onSelectTrackerType}
                  value={item.tracker_type}
                />
              </td>
              <td className="px-3 py-2">
                {item.tracker_equipment_type ?? "--"}
              </td>
              <td className="px-3 py-2 text-right">
                {item.tracker_row ?? "--"}
              </td>
              <td className="max-w-[360px] px-3 py-2">
                <ExpandableComment value={item.comments ?? item.reason} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
