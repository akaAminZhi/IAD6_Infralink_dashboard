import {
  getPowerPlanAreaFamily,
  getPowerPlanAreaName,
  POWER_PLAN_STATUS_COLORS,
  POWER_PLAN_STATUS_LABELS,
  type EnrichedPowerPlanEquipment,
} from "./powerPlanUtils";

type ExcelValue = string | number | boolean | null;

interface PowerPlanExportColumn {
  header: string;
  width: number;
  wrap?: boolean;
  value: (row: EnrichedPowerPlanEquipment) => ExcelValue;
}

const colors = {
  title: "FF0F172A",
  subtitle: "FFE2E8F0",
  header: "FF1E3A8A",
  headerText: "FFFFFFFF",
  border: "FFCBD5E1",
  alternate: "FFF8FAFC",
  muted: "FF475569",
  redFill: "FFFEE2E2",
  redText: "FF991B1B",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function issueDetails(row: EnrichedPowerPlanEquipment): string | null {
  if (row.openIssues.length === 0) return null;
  return row.openIssues
    .map((issue) =>
      `${clean(issue.case_id) || "Case"} | ${clean(issue.summary) || "No summary"}`,
    )
    .join("\n");
}

const exportColumns: PowerPlanExportColumn[] = [
  { header: "Equipment ID", width: 25, value: (row) => row.equipmentId },
  { header: "Equipment Label", width: 22, value: (row) => row.annotation.label },
  { header: "Room / Area", width: 17, value: (row) => getPowerPlanAreaName(row.pdmName) },
  { header: "PDM Name", width: 42, wrap: true, value: (row) => row.pdmName },
  {
    header: "Readiness",
    width: 24,
    value: (row) => POWER_PLAN_STATUS_LABELS[row.status],
  },
  { header: "Equipment Type", width: 28, wrap: true, value: (row) => clean(row.equipment?.equipment_type) || null },
  { header: "Equipment Status", width: 24, wrap: true, value: (row) => clean(row.equipment?.status) || null },
  { header: "Manufacturer", width: 20, value: (row) => clean(row.equipment?.manufacturer) || null },
  { header: "Model", width: 28, wrap: true, value: (row) => clean(row.equipment?.model) || null },
  { header: "Serial Number", width: 24, value: (row) => clean(row.equipment?.serial_number) || null },
  { header: "Open Issues", width: 14, value: (row) => row.openIssues.length },
  { header: "Issue Details", width: 72, wrap: true, value: issueDetails },
];

function border() {
  return {
    top: { style: "thin" as const, color: { argb: colors.border } },
    right: { style: "thin" as const, color: { argb: colors.border } },
    bottom: { style: "thin" as const, color: { argb: colors.border } },
    left: { style: "thin" as const, color: { argb: colors.border } },
  };
}

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function worksheetName(value: string, used: Set<string>): string {
  const base = (value.replace(/[\\/*?:[\]]/g, "-").trim() || "Area").slice(0, 31);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeader(row: import("exceljs").Row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.header } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border();
  });
}

function applyStatusStyle(
  row: import("exceljs").Row,
  equipment: EnrichedPowerPlanEquipment,
) {
  const readinessCell = row.getCell(5);
  const readinessColors = POWER_PLAN_STATUS_COLORS[equipment.status];
  readinessCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: argb(readinessColors.fill) },
  };
  readinessCell.font = { bold: true, color: { argb: argb(readinessColors.text) } };

  if (equipment.openIssues.length > 0) {
    const openIssueCell = row.getCell(11);
    openIssueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.redFill } };
    openIssueCell.font = { bold: true, color: { argb: colors.redText } };
  }
}

function addAreaWorksheet(
  workbook: import("exceljs").Workbook,
  areaFamily: string,
  equipmentRows: EnrichedPowerPlanEquipment[],
  usedNames: Set<string>,
) {
  const worksheet = workbook.addWorksheet(worksheetName(areaFamily, usedNames), {
    properties: { tabColor: { argb: colors.header } },
    views: [{ state: "frozen", xSplit: 4, ySplit: 4 }],
  });
  const sortedRows = [...equipmentRows].sort(
    (a, b) =>
      getPowerPlanAreaName(a.pdmName).localeCompare(getPowerPlanAreaName(b.pdmName), undefined, {
        numeric: true,
      }) ||
      clean(a.pdmName).localeCompare(clean(b.pdmName), undefined, { numeric: true }) ||
      a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true }),
  );
  const pdmCount = new Set(sortedRows.map((row) => clean(row.pdmName)).filter(Boolean)).size;
  const openIssueCount = sortedRows.reduce((total, row) => total + row.openIssues.length, 0);

  worksheet.mergeCells(1, 1, 1, exportColumns.length);
  worksheet.mergeCells(2, 1, 2, exportColumns.length);
  worksheet.getCell(1, 1).value = `IAD06 Power Plan Equipment - ${areaFamily}`;
  worksheet.getCell(1, 1).font = { bold: true, color: { argb: colors.headerText }, size: 16 };
  worksheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.title } };
  worksheet.getCell(1, 1).alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 28;

  worksheet.getCell(2, 1).value = `Selected equipment: ${sortedRows.length} | PDMs: ${pdmCount} | Open issues: ${openIssueCount} | Generated: ${new Date().toLocaleString()}`;
  worksheet.getCell(2, 1).font = { color: { argb: colors.muted }, size: 11 };
  worksheet.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.subtitle } };
  worksheet.getCell(2, 1).alignment = { vertical: "middle" };
  worksheet.getRow(2).height = 22;
  worksheet.getRow(3).height = 8;

  exportColumns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
  });
  const headerRow = worksheet.getRow(4);
  headerRow.values = exportColumns.map((column) => column.header);
  styleHeader(headerRow);
  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: exportColumns.length },
  };

  sortedRows.forEach((equipment, rowIndex) => {
    const row = worksheet.addRow(exportColumns.map((column) => column.value(equipment)));
    exportColumns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.border = border();
      cell.alignment = { vertical: "top", wrapText: column.wrap ?? false };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.alternate } };
      }
    });
    const detailLines = Math.max(equipment.openIssues.length, 1);
    row.height = Math.min(120, Math.max(22, detailLines * 14 + 8));
    applyStatusStyle(row, equipment);
  });

  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

export async function createPowerPlanSelectionWorkbook(
  rows: EnrichedPowerPlanEquipment[],
): Promise<import("exceljs").Workbook> {
  if (rows.length === 0) {
    throw new Error("Select at least one Power Plan equipment record before exporting.");
  }
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IAD06 Infralink Dashboard";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = "IAD06 Power Plan Equipment Selection";
  workbook.subject = "Selected Power Plan equipment, issues, NETA, and EPS details";

  const grouped = new Map<string, EnrichedPowerPlanEquipment[]>();
  rows.forEach((row) => {
    const areaFamily = getPowerPlanAreaFamily(row.pdmName);
    const areaRows = grouped.get(areaFamily) ?? [];
    areaRows.push(row);
    grouped.set(areaFamily, areaRows);
  });
  const usedNames = new Set<string>();
  [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .forEach(([areaFamily, areaRows]) =>
      addAreaWorksheet(workbook, areaFamily, areaRows, usedNames),
    );
  return workbook;
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function downloadPowerPlanSelectionXlsx(
  rows: EnrichedPowerPlanEquipment[],
): Promise<void> {
  const workbook = await createPowerPlanSelectionWorkbook(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `iad6-power-plan-equipment-${fileTimestamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
