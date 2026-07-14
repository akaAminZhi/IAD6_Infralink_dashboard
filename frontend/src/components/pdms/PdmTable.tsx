import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "../../utils/cn";
import { formatNumber } from "../../utils/formatters";
import type { PdmReadinessLevel, PdmTableRow } from "../../utils/pdmUtils";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { PdmReadinessBadge } from "./PdmReadinessBadge";

interface PdmTableProps {
  rows: PdmTableRow[];
  selectedPdmName: string | null;
  onSelectPdm: (row: PdmTableRow) => void;
}

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

const rowReadinessBorderClass: Record<PdmReadinessLevel, string> = {
  "Not Started": "",
  Good: "border-l-4 border-l-emerald-300",
  Watch: "border-l-4 border-l-primary",
  Attention: "border-l-4 border-l-amber-300",
  Critical: "border-l-4 border-l-red-500",
};

export function PdmTable({ rows, selectedPdmName, onSelectPdm }: PdmTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<PdmTableRow>[]>(
    () => [
      {
        accessorKey: "pdmName",
        header: "PDM Name",
        cell: ({ row }) => <span className="font-medium">{row.original.pdmName}</span>,
      },
      {
        accessorKey: "netaCompleteCount",
        header: "NETA Complete",
        cell: ({ row }) => (
          <span className="text-emerald-700">{formatNumber(row.original.netaCompleteCount)}</span>
        ),
      },
      {
        accessorKey: "netaIncompleteCount",
        header: "NETA Incomplete",
        cell: ({ row }) => (
          <span className="text-amber-700">{formatNumber(row.original.netaIncompleteCount)}</span>
        ),
      },
      {
        accessorKey: "netaMissingReportCount",
        header: "Missing NETA Report",
        cell: ({ row }) => (
          <span className="text-red-700">{formatNumber(row.original.netaMissingReportCount)}</span>
        ),
      },
      {
        accessorKey: "openCaseCount",
        header: "Open Cases",
        cell: ({ row }) => <span>{formatNumber(row.original.openCaseCount)}</span>,
      },
      {
        accessorKey: "casesMissingIssueImageCount",
        header: "Cases Missing Image",
        cell: ({ row }) => (
          <span className="text-red-700">
            {formatNumber(row.original.casesMissingIssueImageCount)}
          </span>
        ),
      },
      {
        accessorKey: "readinessScore",
        header: "Current Readiness",
        cell: ({ row }) => <PdmReadinessBadge level={row.original.readinessLevel} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>PDM Readiness Table</CardTitle>
          <CardDescription>
            Search, filter, sort, then select a PDM to inspect equipment and issues.
          </CardDescription>
        </div>
        <StatusBadge tone="muted">{`${formatNumber(rows.length)} shown`}</StatusBadge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No PDMs match the current filters"
            description="Clear filters or search for a different PDM name."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th className="px-3 py-2 font-medium" key={header.id}>
                        {header.isPlaceholder ? null : (
                          <SortableHeader column={header.column}>
                            {String(flexRender(header.column.columnDef.header, header.getContext()))}
                          </SortableHeader>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const original = row.original;
                  const isSelected = selectedPdmName === original.pdmName;

                  return (
                    <tr
                      className={cn(
                        "cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50",
                        isSelected ? "bg-primary/5" : "",
                        rowReadinessBorderClass[original.readinessLevel],
                      )}
                      key={row.id}
                      onClick={() => onSelectPdm(original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td className="px-3 py-3" key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
