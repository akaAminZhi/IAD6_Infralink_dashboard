import { formatNumber } from "../../utils/formatters";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function pageBounds(totalItems: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const offset = (safePage - 1) * pageSize;
  const end = Math.min(totalItems, offset + pageSize);
  return { totalPages, safePage, offset, end };
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const { offset, end } = pageBounds(rows.length, page, pageSize);
  return rows.slice(offset, end);
}

export function PaginationControls({
  itemLabel,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalItems,
}: {
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const { totalPages, safePage, offset, end } = pageBounds(totalItems, page, pageSize);
  const start = totalItems === 0 ? 0 : offset + 1;

  return (
    <div className="flex flex-col gap-3 border-t pt-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <div>
        Showing {formatNumber(start)}-{formatNumber(end)} of {formatNumber(totalItems)} {itemLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            value={pageSize}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          type="button"
        >
          First
        </button>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          type="button"
        >
          Previous
        </button>
        <span className="min-w-[88px] text-center">
          Page {formatNumber(safePage)} / {formatNumber(totalPages)}
        </span>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          type="button"
        >
          Next
        </button>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          type="button"
        >
          Last
        </button>
      </div>
    </div>
  );
}
