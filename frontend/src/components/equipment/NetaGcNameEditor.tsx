import { AlertTriangle, Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { NetaReportFileRecord } from "../../types/data";
import {
  getAutomationAccess,
  getAutomationRun,
  getRunLogs,
  previewNetaGcRename,
  renameNetaGcReport,
} from "../../utils/automationApi";
import { isLocalOperationsMode } from "../../utils/localOperations";
import { useOperationsIdentity } from "../dataOperations/OperationsAuth";

const LOCAL_OPERATOR = "local_operator";
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_for_user"]);
const INVALID_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/;

/** GC renames are restricted to the loopback local operator, never Clerk sessions. */
export function useLocalGcRenameAccess(): boolean {
  const identity = useOperationsIdentity();
  const local = isLocalOperationsMode() && identity === LOCAL_OPERATOR;
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAllowed(false);
    if (local) {
      void getAutomationAccess()
        .then((access) => { if (!cancelled) setAllowed(access.user_id === LOCAL_OPERATOR); })
        .catch(() => { /* Viewing stays available when the local service is offline. */ });
    }
    return () => { cancelled = true; };
  }, [local]);
  return allowed;
}

export function validateGcReportName(value: string): string | null {
  const name = value.trim().replace(/\.pdf$/i, "").trim();
  if (!name) return "Enter a report name.";
  if (name.length > 150) return "Use 150 characters or fewer.";
  if (INVALID_NAME_CHARACTERS.test(name)) return 'Remove \\ / : * ? " < > | characters.';
  return null;
}

export function NetaGcNameEditor({
  record,
  canRename,
  onRenamed,
}: {
  record: NetaReportFileRecord;
  canRename: boolean;
  onRenamed: () => Promise<void> | void;
}) {
  const currentName = String(record.report_name ?? "");
  const currentStem = currentName.replace(/\.pdf$/i, "");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentStem);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const renamed = useRef(onRenamed);
  renamed.current = onRenamed;
  const pending = record.pending_cxalloy_rename;
  const renameable = canRename && !!record.relative_path && !!record.source_sha256;

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const run = await getAutomationRun(runId!);
        if (cancelled) return;
        if (ACTIVE_RUN_STATUSES.has(run.status)) {
          timer = setTimeout(() => void poll(), 1000);
          return;
        }
        if (run.status === "succeeded") {
          setEditing(false);
          setNotice("GC report renamed in the Tracker.");
          await renamed.current();
        } else {
          const logs = await getRunLogs(runId!);
          if (cancelled) return;
          const saved = logs.content.includes("Rename saved, but Dashboard publication failed");
          setError(saved
            ? "Rename saved, but the Dashboard could not refresh. Run Refresh NETA Duplicate Evidence; do not repeat the rename."
            : lastLogLine(logs.content) ?? "Rename failed. Refresh the Dashboard and try again.");
        }
        if (!cancelled) { setRunId(null); setBusy(false); }
      } catch {
        if (!cancelled) {
          setError("Unable to check the rename. Reconnecting; do not submit it again.");
          timer = setTimeout(() => void poll(), 3000);
        }
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [runId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateGcReportName(value);
    if (problem) { setError(problem); return; }
    const newName = value.trim().replace(/\.pdf$/i, "").trim();
    if (newName === currentStem) { setEditing(false); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const reportFile = record.relative_path!;
      const sha = record.source_sha256!;
      const preview = await previewNetaGcRename(reportFile, newName, sha);
      const message = [
        `Rename GC report in the Tracker?\n\n${preview.old_name}\n→ ${preview.new_name}`,
        preview.will_queue_cxalloy
          ? "\nThis report already has CxAlloy upload history. The next Upload CxAlloy Reports run will delete the old attachment and upload the renamed PDF."
          : "\nThe next CxAlloy upload will use the new name.",
      ].join("\n");
      if (!window.confirm(message)) { setBusy(false); return; }
      const run = await renameNetaGcReport(reportFile, newName, sha);
      setRunId(run.run_id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to rename the GC report.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 space-y-1 text-xs">
      {pending ? (
        <p className="flex flex-wrap items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>CxAlloy update pending:</span>
          <span className="break-all">{pending.old_name} → {pending.new_name}</span>
          {pending.last_error ? <span className="basis-full break-words text-red-800">Last attempt: {pending.last_error}</span> : null}
        </p>
      ) : null}
      {renameable && !editing ? (
        <button
          type="button"
          aria-label={`Rename GC report ${currentName}`}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => { setValue(currentStem); setEditing(true); setError(null); setNotice(null); }}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />Rename GC file
        </button>
      ) : null}
      {renameable && editing ? (
        <form className="flex flex-wrap items-center gap-1.5" onSubmit={(event) => void submit(event)}>
          <input
            aria-label="New GC report name"
            autoFocus
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono outline-none focus:ring-2 focus:ring-ring"
            disabled={busy}
            maxLength={154}
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
          <span className="text-muted-foreground">.pdf</span>
          <button type="submit" disabled={busy} aria-label="Save GC report name"
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-primary px-2 text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />}Save
          </button>
          <button type="button" disabled={busy} aria-label="Cancel GC rename" onClick={() => { setEditing(false); setError(null); }}
            className="inline-flex h-7 items-center gap-1 rounded-md border px-2 disabled:opacity-50">
            <X className="h-3 w-3" aria-hidden="true" />Cancel
          </button>
        </form>
      ) : null}
      {error ? <p role="alert" className="break-words text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="text-green-800">{notice}</p> : null}
    </div>
  );
}

function lastLogLine(content: string): string | null {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const failure = [...lines].reverse().find((line) => /Error|Exception|only available/i.test(line));
  return failure ? failure.replace(/^\w+Error:\s*/, "").slice(0, 400) : null;
}
