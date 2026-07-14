import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "../../utils/cn";
import { downloadIssuesXlsx } from "../../utils/exportIssues";
import { formatDateOnly, formatNumber } from "../../utils/formatters";
import {
  isOpenIssue,
  type IssueDueState,
  type EnrichedIssue,
} from "../../utils/issueUtils";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "../common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CorrectiveImagesBadge } from "./CorrectiveImagesBadge";
import { IssueImageBadge } from "./IssueImageBadge";
import { IssuePriorityBadge } from "./IssuePriorityBadge";
import { IssueStatusBadge } from "./IssueStatusBadge";

interface IssueTableProps {
  issues: EnrichedIssue[];
  selectedIssueId: string | null;
  onSelectIssue: (issue: EnrichedIssue) => void;
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

function dueStateSortValue(issue: EnrichedIssue): number {
  const order = {
    Overdue: 5,
    "Due Soon": 4,
    Normal: 3,
    "No Due Date": 2,
    Closed: 1,
  };

  return order[issue.due_state];
}

function dateSortValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

const dueDateToneClass: Record<IssueDueState, string> = {
  Overdue: "border-red-200 bg-red-50 text-red-800",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-800",
  Normal: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "No Due Date": "border-border bg-muted text-muted-foreground",
  Closed: "border-slate-200 bg-slate-50 text-slate-600",
};

export function IssueTable({ issues, selectedIssueId, onSelectIssue }: IssueTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "dueDate", desc: true },
  ]);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportIssues() {
    setIsExporting(true);
    try {
      await downloadIssuesXlsx(issues);
    } catch (error) {
      console.error("Failed to export issues workbook", error);
      window.alert("Unable to export issues workbook. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  const columns = useMemo<ColumnDef<EnrichedIssue>[]>(
    () => [
      {
        accessorKey: "case_id",
        header: "Case ID",
        cell: ({ row }) => <span className="font-medium">{row.original.case_id ?? "--"}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <IssueStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <IssuePriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: "equipment_id",
        header: "Equipment ID",
        cell: ({ row }) => <span>{row.original.equipment_id ?? "--"}</span>,
      },
      {
        accessorKey: "pdm_name",
        header: "PDM Name",
        cell: ({ row }) => <span>{row.original.pdm_name ?? "--"}</span>,
      },
      {
        accessorKey: "summary",
        header: "Summary",
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[360px] whitespace-pre-wrap">
            {row.original.summary ?? "--"}
          </span>
        ),
      },
      {
        accessorKey: "assigned_to",
        header: "Assigned To",
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[260px]">{row.original.assigned_to ?? "--"}</span>
        ),
      },
      {
        id: "dueDate",
        header: "Due Date",
        accessorFn: dueStateSortValue,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
              dueDateToneClass[row.original.due_state],
            )}
            title={row.original.due_state}
          >
            {formatDateOnly(row.original.due_date)}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Issue Created",
        accessorFn: (row) => dateSortValue(row.created_at),
        cell: ({ row }) => <span>{formatDateOnly(row.original.created_at)}</span>,
      },
      {
        id: "issueImage",
        header: "Issue Image",
        accessorFn: (row) => Number(row.has_issue_image),
        cell: ({ row }) => <IssueImageBadge compact issue={row.original} />,
      },
      {
        id: "correctiveImages",
        header: "Corrective Images",
        accessorFn: (row) => Number(row.has_corrective_images),
        cell: ({ row }) => <CorrectiveImagesBadge compact issue={row.original} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: issues,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Issues Table</CardTitle>
          <CardDescription>
            Select an issue to review details, equipment context, and image references.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="gap-2"
            disabled={issues.length === 0 || isExporting}
            onClick={handleExportIssues}
            type="button"
            variant="outline"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? "Exporting..." : "Export .xlsx"}
          </Button>
          <StatusBadge tone="muted">{`${formatNumber(issues.length)} shown`}</StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <EmptyState
            title="No issues match the current filters"
            description="Clear filters or search for a different case."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-left text-sm">
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
                {table.getRowModel().rows.map((row) => {
                  const issue = row.original;
                  const isSelected = selectedIssueId === issue.row_id;
                  const isAttention =
                    issue.due_state === "Overdue" ||
                    !issue.has_issue_image ||
                    (!isOpenIssue(issue) && !issue.has_corrective_images);

                  return (
                    <tr
                      className={cn(
                        "cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50",
                        isSelected ? "bg-primary/5" : "",
                        isAttention ? "border-l-4 border-l-amber-300" : "",
                        !isOpenIssue(issue) ? "opacity-80" : "",
                      )}
                      key={row.id}
                      onClick={() => onSelectIssue(issue)}
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
