import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "../common/StatusBadge";
import { EmptyState } from "../common/EmptyState";
import { formatNumber } from "../../utils/formatters";
import type { EpsTestItemRecord } from "../../types/data";
import { getEpsTestItemStatusLabel } from "../../utils/epsTestItemUtils";
import { ExpandableComment, TrackerTypeBadge } from "./ExecutionTableCells";
import { itemStatusTone } from "./executionPresentation";
import { paginateRows, PaginationControls } from "./ExecutionPagination";

export function TestItemTable({
  activeTrackerType,
  onClearTrackerType,
  onSelectTrackerType,
  rows,
  title,
  description,
}: {
  activeTrackerType: string;
  onClearTrackerType: () => void;
  onSelectTrackerType: (trackerType: string) => void;
  rows: EpsTestItemRecord[];
  title: string;
  description: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => {
    setCurrentPage(1);
  }, [rows]);

  const visibleRows = useMemo(
    () => paginateRows(rows, currentPage, pageSize),
    [currentPage, pageSize, rows],
  );

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {activeTrackerType ? (
            <button
              className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              onClick={onClearTrackerType}
              type="button"
            >
              Tracker Type: {activeTrackerType} x
            </button>
          ) : null}
          <StatusBadge tone="muted">{`${formatNumber(rows.length)} items`}</StatusBadge>
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
            <EmptyState title="No records found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Equipment Name</th>
                    <th className="px-3 py-2 font-medium">Module Equipment</th>
                    <th className="px-3 py-2 font-medium">PDM Name</th>
                    <th className="px-3 py-2 font-medium">Item Status</th>
                    <th className="px-3 py-2 font-medium">Tracker Type</th>
                    <th className="px-3 py-2 font-medium">Equipment Type</th>
                    <th className="px-3 py-2 text-right font-medium">Tracker Row</th>
                    <th className="px-3 py-2 font-medium">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => (
                    <tr className="border-b align-top last:border-0" key={`${row.equipment_key}-${index}`}>
                      <td className="px-3 py-3 font-medium">{row.equipment_name ?? row.equipment_key ?? "--"}</td>
                      <td className="px-3 py-3">{row.module_equipment ?? "--"}</td>
                      <td className="px-3 py-3">{row.pdm_name ?? "--"}</td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={itemStatusTone(row.item_status)}>
                          {getEpsTestItemStatusLabel(row.item_status ?? "--")}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <TrackerTypeBadge
                          activeTrackerType={activeTrackerType}
                          onSelectTrackerType={onSelectTrackerType}
                          value={row.tracker_type}
                        />
                      </td>
                      <td className="px-3 py-3">{row.tracker_equipment_type ?? "--"}</td>
                      <td className="px-3 py-3 text-right">{row.tracker_row ?? "--"}</td>
                      <td className="max-w-[460px] px-3 py-3">
                        <ExpandableComment value={row.comments ?? row.reason} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls
                itemLabel="test items"
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
