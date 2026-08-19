import { AlertTriangle, FileCheck2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  DailyReport,
  MvDailyReport,
  SavedDailyReport,
  SavedMvDailyReport,
} from "../../types/automation";
import {
  AutomationApiError,
  saveDailyReport,
  saveMvDailyReport,
  validateDailyReport,
  validateMvDailyReport,
} from "../../utils/automationApi";
import { cn } from "../../utils/cn";
import { Button } from "../ui/button";

interface DailyReportDialogProps {
  existingReportNames: string[];
  initialReport: DailyReport | MvDailyReport | null;
  open: boolean;
  reportKind?: "eps" | "mv";
  serviceBusy: boolean;
  onClose: () => void;
  onSaved: (result: SavedDailyReport | SavedMvDailyReport) => void;
}

interface ReportEditorSections {
  failed: string;
  retested_and_passed: string;
  tested: string;
  tested_and_passed: string;
  partially_tested: string;
}

const emptySections: ReportEditorSections = {
  failed: "",
  retested_and_passed: "",
  tested: "",
  tested_and_passed: "",
  partially_tested: "",
};

function yesterdayReportName(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getMonth() + 1}-${yesterday.getDate()}.md`;
}

function textFromReport(
  report: DailyReport | MvDailyReport,
  reportKind: "eps" | "mv",
): ReportEditorSections {
  if (reportKind === "mv" && "tested_and_passed" in report.sections) {
    return {
      ...emptySections,
      tested_and_passed: report.sections.tested_and_passed.join("\n"),
      partially_tested: report.sections.partially_tested.join("\n"),
      failed: report.sections.failed.join("\n"),
      retested_and_passed: report.sections.retested_and_passed.join("\n"),
    };
  }
  if ("tested" in report.sections) {
    return {
      ...emptySections,
      failed: report.sections.failed.join("\n"),
      retested_and_passed: report.sections.retested_and_passed.join("\n"),
      tested: report.sections.tested.join("\n"),
    };
  }
  return emptySections;
}

function localItems(value: string, compactIdsOnly = false): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const item = line.replace(/^\s*(?:(?:[-*+])|(?:\d+[.)]))\s+/, "").trim();
    const key = item.toUpperCase().replace(/\s+/g, " ");
    if (
      item &&
      (!compactIdsOnly ||
        (!item.includes(" ") && item.includes("-") && /\d/.test(item))) &&
      !seen.has(key)
    ) {
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

export function DailyReportDialog({
  existingReportNames,
  initialReport,
  open,
  reportKind = "eps",
  serviceBusy,
  onClose,
  onSaved,
}: DailyReportDialogProps) {
  const [reportName, setReportName] = useState(yesterdayReportName());
  const [sections, setSections] = useState(emptySections);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setReportName(initialReport?.report_name ?? yesterdayReportName());
    setSections(initialReport ? textFromReport(initialReport, reportKind) : emptySections);
    setError(null);
    setSaving(false);
    setConfirmOverwrite(false);
  }, [initialReport, open, reportKind]);

  const activeSectionKeys: Array<keyof ReportEditorSections> = reportKind === "mv"
    ? ["tested_and_passed", "partially_tested", "failed", "retested_and_passed"]
    : ["failed", "retested_and_passed", "tested"];

  const localCounts = useMemo(
    () => ({
      failed: localItems(sections.failed, reportKind === "mv").length,
      retested_and_passed: localItems(
        sections.retested_and_passed,
        reportKind === "mv",
      ).length,
      tested: localItems(sections.tested).length,
      tested_and_passed: localItems(sections.tested_and_passed, true).length,
      partially_tested: localItems(sections.partially_tested, true).length,
    }),
    [reportKind, sections],
  );

  const duplicateWarnings = useMemo(() => {
    const placements = new Map<string, string[]>();
    const labels: Record<keyof typeof sections, string> = {
      failed: "Failed",
      retested_and_passed: "Retested And Passed",
      tested: "Tested",
      tested_and_passed: "Tested And Passed",
      partially_tested: "Partially Tested",
    };
    activeSectionKeys.forEach((section) => {
      localItems(sections[section], reportKind === "mv").forEach((item) => {
        const key = item.toUpperCase().replace(/\s+/g, " ");
        placements.set(key, [...(placements.get(key) ?? []), labels[section]]);
      });
    });
    return Array.from(placements.entries())
      .filter(([, sectionNames]) => sectionNames.length > 1)
      .map(([item, sectionNames]) => `${item}: ${sectionNames.join(" / ")}`);
  }, [activeSectionKeys, reportKind, sections]);

  if (!open) {
    return null;
  }

  const normalizedName = reportName.trim().toLowerCase().endsWith(".md")
    ? reportName.trim()
    : `${reportName.trim()}.md`;
  const exists = existingReportNames.some(
    (name) => name.toLowerCase() === normalizedName.toLowerCase(),
  );

  async function executeSave(overwrite: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = reportKind === "mv"
        ? await (async () => {
            await validateMvDailyReport({
              tested_and_passed: sections.tested_and_passed,
              partially_tested: sections.partially_tested,
              failed: sections.failed,
              retested_and_passed: sections.retested_and_passed,
            });
            return saveMvDailyReport(reportName, {
              tested_and_passed: sections.tested_and_passed,
              partially_tested: sections.partially_tested,
              failed: sections.failed,
              retested_and_passed: sections.retested_and_passed,
              overwrite,
            });
          })()
        : await (async () => {
            await validateDailyReport({
              failed: sections.failed,
              retested_and_passed: sections.retested_and_passed,
              tested: sections.tested,
            });
            return saveDailyReport(reportName, {
              failed: sections.failed,
              retested_and_passed: sections.retested_and_passed,
              tested: sections.tested,
              overwrite,
            });
          })();
      onSaved(result);
    } catch (saveError) {
      const message =
        reportKind === "mv" &&
        saveError instanceof AutomationApiError &&
        saveError.status === 404
          ? "The MV report API is unavailable. Restart the local task service, then save again."
          : saveError instanceof AutomationApiError || saveError instanceof Error
            ? saveError.message
            : `The ${reportKind === "mv" ? "MV " : ""}daily report could not be saved.`;
      setError(message);
    } finally {
      setSaving(false);
      setConfirmOverwrite(false);
    }
  }

  function requestSave() {
    if (exists) {
      setConfirmOverwrite(true);
      return;
    }
    void executeSave(false);
  }

  const epsSectionFields: Array<{
    key: keyof typeof sections;
    label: string;
    tone: string;
    placeholder: string;
  }> = [
    {
      key: "failed",
      label: "Failed",
      tone: "border-red-200 bg-red-50/50",
      placeholder: "PDU6-02D-3-CT-PRI",
    },
    {
      key: "retested_and_passed",
      label: "Retested And Passed",
      tone: "border-teal-200 bg-teal-50/50",
      placeholder: "PDU6-01A-2-PQM1-CT01",
    },
    {
      key: "tested",
      label: "Tested",
      tone: "border-emerald-200 bg-emerald-50/50",
      placeholder: "PDU6-02D-1-PQM1-CT01",
    },
  ];
  const mvSectionFields: typeof epsSectionFields = [
    {
      key: "tested_and_passed",
      label: "Tested And Passed",
      tone: "border-emerald-200 bg-emerald-50/50",
      placeholder: "FD01-IAD06-TX6-01A",
    },
    {
      key: "partially_tested",
      label: "Partially Tested",
      tone: "border-amber-200 bg-amber-50/50",
      placeholder: "FD02-IAD06-TX6-01B",
    },
    {
      key: "failed",
      label: "Failed",
      tone: "border-red-200 bg-red-50/50",
      placeholder: "FD03-IAD06-TX6-01C",
    },
    {
      key: "retested_and_passed",
      label: "Retested And Passed",
      tone: "border-teal-200 bg-teal-50/50",
      placeholder: "FD04-IAD06-TX6-01D-A",
    },
  ];
  const sectionFields = reportKind === "mv" ? mvSectionFields : epsSectionFields;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
    >
      <div className="flex max-h-[94vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-normal">
              {initialReport
                ? `Edit ${reportKind === "mv" ? "MV " : ""}Daily Test Report`
                : `New ${reportKind === "mv" ? "MV " : ""}Daily Test Report`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One test item per line. Markdown bullets are accepted.
            </p>
          </div>
          <button
            aria-label="Close daily report editor"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <label className="block max-w-md text-sm font-medium">
            Report file name
            <input
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) => setReportName(event.target.value)}
              spellCheck={false}
              value={reportName}
            />
          </label>

          <div
            className={cn(
              "mt-5 grid gap-4",
              reportKind === "mv" ? "lg:grid-cols-4" : "lg:grid-cols-3",
            )}
          >
            {sectionFields.map((field) => (
              <label
                className={cn("block rounded-md border p-3", field.tone)}
                key={field.key}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                  {field.label}
                  <span className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium">
                    {localCounts[field.key]}
                  </span>
                </span>
                <textarea
                  className="mt-3 min-h-[360px] w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                  onChange={(event) =>
                    setSections((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  spellCheck={false}
                  value={sections[field.key]}
                />
              </label>
            ))}
          </div>

          {duplicateWarnings.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {duplicateWarnings.length} cross-section duplicate
                {duplicateWarnings.length === 1 ? "" : "s"}
              </div>
              <div className="mt-2 max-h-24 overflow-y-auto font-mono text-xs">
                {duplicateWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck2 className="h-4 w-4" />
            {reportKind === "mv"
              ? "Saved separately from EPS reports; no EPS wash is started."
              : "Saving also rebuilds daily_tested_equipment.md."}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving || serviceBusy || !reportName.trim()}
              onClick={requestSave}
              type="button"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Report"}
            </Button>
          </div>
        </div>
      </div>

      {confirmOverwrite ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-2xl">
            <h3 className="text-lg font-semibold tracking-normal">Replace existing report?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {normalizedName} already exists. Its current contents will be replaced.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setConfirmOverwrite(false)} variant="outline">
                Keep Existing
              </Button>
              <Button
                className="bg-red-700 text-white hover:bg-red-800"
                disabled={saving}
                onClick={() => void executeSave(true)}
              >
                Replace Report
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
