import {
  getIssueNetaStatus,
  getIssueSummaryMetrics,
  isClosedStatus,
  type EnrichedIssue,
} from "./issueUtils";

type ExcelValue = string | number | boolean | Date | null;

interface IssueExportColumn {
  header: string;
  width: number;
  wrap?: boolean;
  dateFormat?: string;
  value: (issue: EnrichedIssue) => ExcelValue;
}

const issueExportColumns: IssueExportColumn[] = [
  { header: "Case ID", width: 24, value: (issue) => issue.case_id },
  { header: "Status", width: 18, value: (issue) => issue.status },
  { header: "Priority", width: 18, value: (issue) => issue.priority },
  { header: "Summary", width: 56, wrap: true, value: (issue) => issue.summary },
  { header: "Assigned To", width: 26, wrap: true, value: (issue) => issue.assigned_to },
  {
    header: "Reported On",
    width: 18,
    dateFormat: "m/d/yyyy h:mm AM/PM",
    value: (issue) => toExcelDate(issue.reported_on),
  },
  {
    header: "Due Date",
    width: 15,
    dateFormat: "m/d/yyyy",
    value: (issue) => toExcelDate(issue.due_date),
  },
  {
    header: "Created At",
    width: 18,
    dateFormat: "m/d/yyyy h:mm AM/PM",
    value: (issue) => toExcelDate(issue.created_at),
  },
  {
    header: "Last Updated",
    width: 18,
    dateFormat: "m/d/yyyy h:mm AM/PM",
    value: (issue) => toExcelDate(issue.last_updated_at),
  },
  { header: "Issue Image", width: 34, wrap: true, value: (issue) => issue.issue_image },
  { header: "Has Issue Image", width: 16, value: (issue) => issue.has_issue_image },
  {
    header: "Corrective Images",
    width: 34,
    wrap: true,
    value: (issue) => issue.corrective_images,
  },
  {
    header: "Has Corrective Images",
    width: 20,
    value: (issue) => issue.has_corrective_images,
  },
  { header: "Equipment ID", width: 24, value: (issue) => issue.equipment_id },
  { header: "PDM Name", width: 36, value: (issue) => issue.pdm_name },
  { header: "Equipment Status", width: 22, value: (issue) => issue.equipment_status },
  { header: "Manufacturer", width: 22, value: (issue) => issue.manufacturer },
  { header: "Model", width: 22, value: (issue) => issue.model },
  { header: "Serial Number", width: 22, value: (issue) => issue.serial_number },
  { header: "NETA Status", width: 24, value: (issue) => getIssueNetaStatus(issue) },
  { header: "NETA Complete", width: 16, value: (issue) => issue.neta_complete },
  {
    header: "NETA Completed Time",
    width: 20,
    dateFormat: "m/d/yyyy h:mm AM/PM",
    value: (issue) => toExcelDate(issue.neta_completed_at),
  },
  {
    header: "NETA Test Report",
    width: 52,
    wrap: true,
    value: (issue) => issue.neta_test_report,
  },
  { header: "NETA Report Status", width: 22, value: (issue) => issue.neta_report_status },
];

const workbookColors = {
  titleFill: "FF0F172A",
  subtitleFill: "FFE2E8F0",
  headerFill: "FF1E3A8A",
  headerText: "FFFFFFFF",
  border: "FFCBD5E1",
  alternateRow: "FFF8FAFC",
  white: "FFFFFFFF",
  mutedText: "FF475569",
};

const dueStateStyles = {
  Overdue: { fill: "FFFEE2E2", text: "FF991B1B" },
  "Due Soon": { fill: "FFFEF3C7", text: "FF92400E" },
  Normal: { fill: "FFDCFCE7", text: "FF166534" },
  "No Due Date": { fill: "FFF1F5F9", text: "FF475569" },
  Closed: { fill: "FFE2E8F0", text: "FF475569" },
} as const;

const priorityStyles = {
  urgent: { fill: "FFFEE2E2", text: "FF991B1B" },
  high: { fill: "FFFFEDD5", text: "FF9A3412" },
} as const;

function toExcelDate(value: string | null | undefined): Date | string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function makeFileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function emptyToNull(value: ExcelValue): ExcelValue {
  return value === "" ? null : value;
}

function thinBorder() {
  return {
    top: { style: "thin" as const, color: { argb: workbookColors.border } },
    right: { style: "thin" as const, color: { argb: workbookColors.border } },
    bottom: { style: "thin" as const, color: { argb: workbookColors.border } },
    left: { style: "thin" as const, color: { argb: workbookColors.border } },
  };
}

function styleTitleRows(worksheet: import("exceljs").Worksheet, title: string, subtitle: string) {
  const columnCount = issueExportColumns.length;

  worksheet.mergeCells(1, 1, 1, columnCount);
  worksheet.mergeCells(2, 1, 2, columnCount);

  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: workbookColors.headerText }, size: 16 };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: workbookColors.titleFill },
  };
  titleCell.alignment = { vertical: "middle" };

  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { color: { argb: workbookColors.mutedText }, size: 11 };
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: workbookColors.subtitleFill },
  };
  subtitleCell.alignment = { vertical: "middle" };

  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 22;
}

function styleHeaderRow(row: import("exceljs").Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: workbookColors.headerText } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: workbookColors.headerFill },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
  row.height = 24;
}

function applyBodyCellStyle(
  cell: import("exceljs").Cell,
  column: IssueExportColumn,
  isAlternateRow: boolean,
) {
  cell.border = thinBorder();
  cell.alignment = {
    vertical: "top",
    wrapText: column.wrap ?? false,
  };

  if (column.dateFormat && cell.value instanceof Date) {
    cell.numFmt = column.dateFormat;
  }

  if (isAlternateRow) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: workbookColors.alternateRow },
    };
  }
}

function applyIssueRowConditionalStyles(row: import("exceljs").Row, issue: EnrichedIssue) {
  const dueDateCell = row.getCell(getIssueColumnIndex("Due Date"));
  const dueStyle = dueStateStyles[issue.due_state];

  dueDateCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: dueStyle.fill },
  };
  dueDateCell.font = { bold: true, color: { argb: dueStyle.text } };

  const priority = String(issue.priority ?? "").toLowerCase();
  const priorityStyle = priority.includes("urgent")
    ? priorityStyles.urgent
    : priority.includes("high")
      ? priorityStyles.high
      : null;

  if (priorityStyle) {
    const priorityCell = row.getCell(getIssueColumnIndex("Priority"));
    priorityCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: priorityStyle.fill },
    };
    priorityCell.font = { bold: true, color: { argb: priorityStyle.text } };
  }

  if (!issue.has_issue_image) {
    const imageCell = row.getCell(getIssueColumnIndex("Issue Image"));
    imageCell.value = "Missing Issue Image";
    imageCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEE2E2" },
    };
    imageCell.font = { bold: true, color: { argb: "FF991B1B" } };
  }

  if (isClosedStatus(issue.status) && !issue.has_corrective_images) {
    const correctiveCell = row.getCell(getIssueColumnIndex("Corrective Images"));
    correctiveCell.value = "Missing Corrective Images";
    correctiveCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEE2E2" },
    };
    correctiveCell.font = { bold: true, color: { argb: "FF991B1B" } };
  }
}

function getIssueColumnIndex(header: string): number {
  const columnIndex = issueExportColumns.findIndex((column) => column.header === header);
  if (columnIndex === -1) {
    throw new Error(`Missing issue export column: ${header}`);
  }
  return columnIndex + 1;
}

function addIssuesWorksheet(workbook: import("exceljs").Workbook, issues: EnrichedIssue[]) {
  const worksheet = workbook.addWorksheet("Issues", {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: { tabColor: { argb: workbookColors.headerFill } },
  });

  const exportedAt = new Date().toLocaleString();
  styleTitleRows(
    worksheet,
    "IAD06 Issues Export",
    `Generated ${exportedAt} | Records exported: ${issues.length}`,
  );

  issueExportColumns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
  });

  const headerRow = worksheet.getRow(4);
  headerRow.values = issueExportColumns.map((column) => column.header);
  styleHeaderRow(headerRow);

  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: issueExportColumns.length },
  };

  issues.forEach((issue, index) => {
    const values = issueExportColumns.map((column) => emptyToNull(column.value(issue)));
    const row = worksheet.addRow(values);
    const isAlternateRow = index % 2 === 1;

    issueExportColumns.forEach((column, columnIndex) => {
      applyBodyCellStyle(row.getCell(columnIndex + 1), column, isAlternateRow);
    });
    applyIssueRowConditionalStyles(row, issue);
  });

  worksheet.eachRow((row) => {
    row.commit();
  });
}

function addSummaryWorksheet(workbook: import("exceljs").Workbook, issues: EnrichedIssue[]) {
  const worksheet = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF64748B" } },
  });
  const metrics = getIssueSummaryMetrics(issues);
  const exportedAt = new Date().toLocaleString();

  worksheet.columns = [
    { key: "metric", width: 34 },
    { key: "value", width: 18 },
  ];

  worksheet.mergeCells("A1:B1");
  worksheet.getCell("A1").value = "IAD06 Issues Export Summary";
  worksheet.getCell("A1").font = { bold: true, color: { argb: workbookColors.headerText }, size: 16 };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: workbookColors.titleFill },
  };
  worksheet.getCell("A1").alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 26;

  const rows: Array<[string, string | number]> = [
    ["Generated", exportedAt],
    ["Records Exported", issues.length],
    ["Total Issues", metrics.totalIssues],
    ["Open Issues", metrics.openIssues],
    ["Urgent Issues", metrics.urgentIssues],
    ["High Priority Issues", metrics.highPriorityIssues],
    ["Overdue Issues", metrics.overdueIssues],
    ["Due Soon", metrics.dueSoonIssues],
    ["Missing Issue Image", metrics.missingIssueImage],
    [
      "Closed Issues Missing Corrective Images",
      issues.filter((issue) => isClosedStatus(issue.status) && !issue.has_corrective_images).length,
    ],
    ["Assigned Issues", metrics.assignedIssues],
  ];

  worksheet.getRow(3).values = [undefined, "Metric", "Value"];
  styleHeaderRow(worksheet.getRow(3));

  rows.forEach(([metric, value]) => {
    const row = worksheet.addRow({ metric, value });
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle" };
    });
    row.getCell(1).font = { bold: true };
  });
}

export async function downloadIssuesXlsx(issues: EnrichedIssue[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "IAD06 Infralink Dashboard";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "IAD06 issue export";
  workbook.title = "IAD06 Issues Export";

  addSummaryWorksheet(workbook, issues);
  addIssuesWorksheet(workbook, issues);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `iad6-issues-${makeFileTimestamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
