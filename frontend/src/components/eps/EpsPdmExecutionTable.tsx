import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { EpsModuleExecutionRecord, EpsPdmExecutionRecord, EpsTestItemRecord } from "../../types/data";
import { normalizeGroupKey } from "../../utils/epsExecutionFilters";
import { groupModulesByPdm, groupTestItemsByModule } from "../../utils/epsExecutionRows";
import { formatNumber } from "../../utils/formatters";
import { EpsModuleExecutionTable } from "./EpsModuleExecutionTable";
import { PaginationControls, paginateRows } from "./ExecutionPagination";
import { StatusPill } from "./ExecutionTableCells";
import { formatPercent } from "./executionPresentation";

export function PdmExecutionTable({
  hasItemScope,
  activeTrackerType,
  moduleRecords,
  onSelectTrackerType,
  rows,
  testItems,
}: {
  hasItemScope: boolean;
  activeTrackerType: string;
  moduleRecords: EpsModuleExecutionRecord[];
  onSelectTrackerType: (trackerType: string) => void;
  rows: EpsPdmExecutionRecord[];
  testItems: EpsTestItemRecord[];
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [expandedPdm, setExpandedPdm] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const toggleModule = (moduleKey: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  };
  useEffect(() => {
    setCurrentPage(1);
    setExpandedPdm(null);
    setExpandedModules(new Set());
  }, [rows]);

  const visibleRows = useMemo(
    () => paginateRows(rows, currentPage, pageSize),
    [currentPage, pageSize, rows],
  );
  const modulesByPdm = useMemo(() => groupModulesByPdm(moduleRecords), [moduleRecords]);
  const testItemsByModule = useMemo(() => groupTestItemsByModule(testItems), [testItems]);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>PDM Execution Table</CardTitle>
          <CardDescription>EPS execution progress grouped by PDM.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone="muted">{`${formatNumber(rows.length)} PDMs`}</StatusBadge>
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-expanded={isVisible}
            onClick={() => setIsVisible((current) => !current)}
            type="button"
          >
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
      </CardHeader>
      {isVisible && (
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="No PDMs match the current filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">PDM Name</th>
                    <th className="px-3 py-2 font-medium">EPS Status</th>
                    <th className="px-3 py-2 text-right font-medium">Modules</th>
                    <th className="px-3 py-2 text-right font-medium">Complete</th>
                    <th className="px-3 py-2 text-right font-medium">Waiting Infralink NETA</th>
                    <th className="px-3 py-2 text-right font-medium">Partial</th>
                    <th className="px-3 py-2 text-right font-medium">Failed</th>
                    <th className="px-3 py-2 text-right font-medium">Not Started</th>
                    <th className="px-3 py-2 text-right font-medium">Tracker Items</th>
                    <th className="px-3 py-2 text-right font-medium">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const groupKey = normalizeGroupKey(row.pdm_name);
                    const isExpanded = expandedPdm === groupKey;
                    return (
                      <Fragment key={row.pdm_name ?? groupKey}>
                        <tr className="border-b align-top last:border-0">
                          <td className="px-3 py-3 font-medium">
                            <button
                              className="flex max-w-[280px] items-start gap-2 text-left font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setExpandedPdm(isExpanded ? null : groupKey)}
                              type="button"
                            >
                              <ChevronDown
                                className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                                  isExpanded ? "rotate-0" : "-rotate-90"
                                }`}
                              />
                              <span>{row.pdm_name ?? "--"}</span>
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill status={row.eps_execution_status} />
                          </td>
                          <td className="px-3 py-3 text-right">{formatNumber(row.module_equipment_count)}</td>
                          <td className="px-3 py-3 text-right text-emerald-700">{formatNumber(row.complete_count)}</td>
                          <td className="px-3 py-3 text-right text-amber-700">
                            {formatNumber(row.waiting_infralink_neta_count)}
                          </td>
                          <td className="px-3 py-3 text-right text-amber-700">{formatNumber(row.partial_count)}</td>
                          <td className="px-3 py-3 text-right text-red-700">{formatNumber(row.failed_count)}</td>
                          <td className="px-3 py-3 text-right">{formatNumber(row.not_started_count)}</td>
                          <td className="px-3 py-3 text-right">{formatNumber(row.tracker_item_count)}</td>
                          <td className="px-3 py-3 text-right">{formatPercent(row.field_test_completion_rate)}</td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b bg-muted/20" key={`${row.pdm_name}-details`}>
                            <td className="px-3 py-4" colSpan={10}>
                              <EpsModuleExecutionTable
                                activeTrackerType={activeTrackerType}
                                expandedModules={expandedModules}
                                hasItemScope={hasItemScope}
                                modules={modulesByPdm.get(groupKey) ?? []}
                                onSelectTrackerType={onSelectTrackerType}
                                onToggleModule={toggleModule}
                                testItemsByModule={testItemsByModule}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <PaginationControls
                itemLabel="PDMs"
                onPageChange={setCurrentPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setCurrentPage(1);
                }}
                page={currentPage}
                pageSize={pageSize}
                totalItems={rows.length}
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
