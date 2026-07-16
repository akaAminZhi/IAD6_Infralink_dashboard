import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import {
  getCasesMissingIssueImageCount,
  getNetaReportNames,
  getOpenCaseCount,
  hasMissingNetaReport,
  type FlattenedEquipmentRow,
} from "../../utils/equipmentUtils";
import { getNetaReportLinks } from "../../utils/netaReports";
import { EpsExecutionBadge } from "../common/EpsTestItemsPanel";
import { EmptyState } from "../common/EmptyState";
import { NetaReportChips } from "../common/NetaReportChips";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EquipmentAttentionBadges } from "./EquipmentAttentionBadges";
import { EquipmentNetaBadge } from "./EquipmentNetaBadge";

interface EquipmentTableProps {
  rows: FlattenedEquipmentRow[];
  selectedRowId: string | null;
  onSelectEquipment: (row: FlattenedEquipmentRow) => void;
}

const PAGE_SIZE = 100;
type ReportNameMode = "original" | "gc";

function SortableHeader({
  children,
  column,
}: {
  children: string;
  column: {
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;

  if (!column.getCanSort()) {
    return <span>{children}</span>;
  }

  return (
    <button
      className="inline-flex items-center gap-1 text-left font-medium"
      onClick={column.getToggleSortingHandler()}
      type="button"
    >
      {children}
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function EquipmentTable({ rows, selectedRowId, onSelectEquipment }: EquipmentTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "openCases", desc: true },
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedReportModes, setExpandedReportModes] = useState<Map<string, ReportNameMode>>(
    () => new Map(),
  );
  const netaReportManifest = useNetaReportManifest();

  function hasGcReportLinks(reportNames: string[]): boolean {
    return reportNames.some((reportName) =>
      getNetaReportLinks(reportName, netaReportManifest).some((link) => link.sourceKey === "gc"),
    );
  }

  function toggleReports(rowId: string, canShowGcNames: boolean) {
    setExpandedReportModes((current) => {
      const next = new Map(current);
      const currentMode = next.get(rowId);
      if (currentMode === "original" && canShowGcNames) {
        next.set(rowId, "gc");
      } else if (currentMode === "original" || currentMode === "gc") {
        next.delete(rowId);
      } else {
        next.set(rowId, "original");
      }
      return next;
    });
  }

  const columns = useMemo<ColumnDef<FlattenedEquipmentRow>[]>(
    () => [
      {
        accessorKey: "display_equipment_id",
        header: "Equipment ID",
        cell: ({ row }) => <span className="font-medium">{row.original.display_equipment_id}</span>,
      },
      {
        accessorKey: "pdm_name",
        header: "PDM Name",
        cell: ({ row }) => <span>{row.original.pdm_name ?? "--"}</span>,
      },
      {
        id: "netaReportCount",
        header: "NETA Test Reports",
        accessorFn: (row) => getNetaReportNames(row.neta_test_report).length,
        cell: ({ row }) => {
          const reportNames = getNetaReportNames(row.original.neta_test_report);
          const expandedMode = expandedReportModes.get(row.original.row_id);

          if (reportNames.length === 0) {
            return <span>0 reports</span>;
          }

          return (
            <div
              className={cn(
                "space-y-2",
                expandedMode ? "w-[520px] max-w-[520px]" : "max-w-[640px]",
              )}
            >
              <Button
                aria-expanded={expandedMode !== undefined}
                className="h-8 px-2 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleReports(row.original.row_id, hasGcReportLinks(reportNames));
                }}
                type="button"
                variant="outline"
              >
                {formatNumber(reportNames.length)} reports
              </Button>
              {expandedMode ? (
                <NetaReportChips compactNameMode={expandedMode} reports={reportNames} />
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <span>{row.original.status ?? "--"}</span>,
      },
      {
        id: "epsTestItems",
        header: "EPS Test Items",
        accessorFn: (row) => row.eps_test_items.length,
        cell: ({ row }) => <span>{formatNumber(row.original.eps_test_items.length)}</span>,
      },
      {
        id: "epsStatus",
        header: "EPS Status",
        cell: ({ row }) => <EpsExecutionBadge items={row.original.eps_test_items} />,
        enableSorting: false,
      },
      {
        id: "neta",
        header: "NETA",
        cell: ({ row }) => <EquipmentNetaBadge equipment={row.original} />,
      },
      {
        id: "openCases",
        header: "Open Cases",
        accessorFn: (row) => getOpenCaseCount(row),
        cell: ({ row }) => <span>{formatNumber(getOpenCaseCount(row.original))}</span>,
      },
      {
        id: "missingImages",
        header: "Cases Missing Image",
        accessorFn: (row) => getCasesMissingIssueImageCount(row),
        cell: ({ row }) => (
          <span className="text-red-700">
            {formatNumber(getCasesMissingIssueImageCount(row.original))}
          </span>
        ),
      },
      {
        id: "attention",
        header: "Attention",
        cell: ({ row }) => <EquipmentAttentionBadges equipment={row.original} />,
        enableSorting: false,
      },
    ],
    [expandedReportModes],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });
  const sortedRows = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageStart = pageIndex * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sortedRows.length);
  const visibleRows = sortedRows.slice(pageStart, pageEnd);

  useEffect(() => {
    setPageIndex(0);
  }, [rows, sorting]);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Equipment Lookup Table</CardTitle>
          <CardDescription>
            Select an equipment row to inspect EPS tests, NETA status, PDM context, and cases.
          </CardDescription>
        </div>
        <StatusBadge tone="muted">
          {rows.length > PAGE_SIZE
            ? `${formatNumber(pageStart + 1)}-${formatNumber(pageEnd)} of ${formatNumber(rows.length)}`
            : `${formatNumber(rows.length)} shown`}
        </StatusBadge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No equipment matches the current filters"
            description="Clear filters or search for a different equipment ID."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th className="px-3 py-2 font-medium" key={header.id}>
                        {header.isPlaceholder ? null : (
                          <SortableHeader column={header.column}>
                            {String(
                              flexRender(header.column.columnDef.header, header.getContext()),
                            )}
                          </SortableHeader>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const original = row.original;
                  const isSelected = selectedRowId === original.row_id;
                  const hasAttention =
                    getOpenCaseCount(original) > 0 ||
                    getCasesMissingIssueImageCount(original) > 0 ||
                    hasMissingNetaReport(original);

                  return (
                    <tr
                      className={cn(
                        "cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50",
                        isSelected ? "bg-primary/5" : "",
                      )}
                      key={row.id}
                      onClick={() => onSelectEquipment(original)}
                    >
                      {row.getVisibleCells().map((cell, cellIndex) => (
                        <td
                          className={cn(
                            "px-3 py-3",
                            hasAttention && cellIndex === 0
                              ? "shadow-[inset_4px_0_0_#fcd34d]"
                              : "",
                          )}
                          key={cell.id}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
                <div className="text-muted-foreground">
                  Showing {formatNumber(pageStart + 1)}-{formatNumber(pageEnd)} of{" "}
                  {formatNumber(rows.length)} matching equipment rows
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    type="button"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <span className="min-w-[92px] text-center text-muted-foreground">
                    Page {formatNumber(pageIndex + 1)} / {formatNumber(pageCount)}
                  </span>
                  <Button
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                    type="button"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
