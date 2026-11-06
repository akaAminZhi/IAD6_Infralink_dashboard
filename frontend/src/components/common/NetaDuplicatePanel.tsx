import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDashboardResources } from "../../contexts/DashboardResourcesContext";
import { useNetaReportManifest } from "../../contexts/NetaReportManifestContext";
import type { NetaDuplicateMatch, NetaReportFileRecord } from "../../types/data";
import { decideNetaDuplicate, getAutomationAccess, getAutomationRun, getRunLogs, runAutomationJob } from "../../utils/automationApi";
import { duplicateCounts, duplicateLabel, getEquipmentDuplicates } from "../../utils/netaDuplicates";
import { useOperationsIdentity } from "../dataOperations/OperationsAuth";
import { ReportPreviewModal } from "./NetaReportChips";

export function NetaDuplicateSummary({ equipmentId }: { equipmentId?: string | null }) {
  const manifest = useNetaReportManifest();
  const counts = duplicateCounts(getEquipmentDuplicates(manifest, equipmentId));
  if (!counts.possible && !counts.confirmed && !counts.invalid) return null;
  return <span className="flex flex-wrap gap-1 text-[11px] font-medium text-amber-900">
    {counts.possible > 0 && <span>{counts.possible} Possible Duplicate group(s)</span>}
    {counts.confirmed > 0 && <span>{counts.confirmed} Confirmed Duplicate group(s)</span>}
    {counts.invalid > 0 && <span>{counts.invalid} invalid duplicate evidence group(s)</span>}
  </span>;
}

export function NetaDuplicatePanel({ equipmentId }: { equipmentId?: string | null }) {
  const manifest = useNetaReportManifest(!!equipmentId);
  const resources = useDashboardResources(["netaReportManifest"], !!equipmentId);
  const identity = useOperationsIdentity();
  const [authorizedIdentity, setAuthorizedIdentity] = useState<string | null>(null);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const editable = !!identity && authorizedIdentity === identity;
  const [decision, setDecision] = useState<{ match: NetaDuplicateMatch; action: "confirm" | "revoke" } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ displayName: string; fileName: string; sourceLabel: string; url: string } | null>(null);
  const refresh = useRef(resources.refresh);
  refresh.current = resources.refresh;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setAuthorizedIdentity(null);
    setDecision(null);
    if (identity) void getAutomationAccess().then(() => {
      if (!cancelled) setAuthorizedIdentity(identity);
    }).catch(() => { /* Viewing is independent of operator access. */ });
    return () => { cancelled = true; };
  }, [identity, accessAttempt]);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const run = await getAutomationRun(runId!);
        if (cancelled) return;
        if (["queued", "running", "waiting_for_user"].includes(run.status)) {
          timer = setTimeout(() => void poll(), 1000);
          return;
        }
        if (run.status === "succeeded") {
          try {
            await refresh.current();
            if (!cancelled) { setError(null); setNotice("Duplicate evidence refreshed. No CxAlloy attachments were changed."); }
          } catch {
            if (!cancelled) setError("Operation completed, but updated evidence could not be loaded. Use Refresh duplicate evidence; do not repeat the decision.");
          }
        } else {
          const logs = await getRunLogs(runId!);
          if (!cancelled) setError(logs.content.includes("Duplicate decision saved")
            ? "Decision saved, but publication failed. Use Refresh duplicate evidence; do not repeat the decision."
            : "Duplicate operation failed. Evidence may have changed or another operation is active. Refresh duplicate evidence and review again.");
        }
        if (!cancelled) setRunId(null);
      } catch {
        if (!cancelled) {
          setError("Unable to check the operation. Reconnecting; do not submit another decision.");
          timer = setTimeout(() => void poll(), 3000);
        }
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [runId]);

  if (!equipmentId || resources.loading) return null;
  const audit = manifest?.duplicate_audit;
  const matches = getEquipmentDuplicates(manifest, equipmentId);
  const busy = starting || !!runId;
  async function submit(refreshOnly = false) {
    setStarting(true); setError(null); setNotice(null);
    try {
      const run = refreshOnly ? await runAutomationJob("refresh_neta_duplicate_evidence")
        : await decideNetaDuplicate(decision!.match.match_id, decision!.match.revision, decision!.action);
      if (mounted.current) { setDecision(null); setRunId(run.run_id); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Unable to submit duplicate decision.");
    } finally {
      if (mounted.current) setStarting(false);
    }
  }
  function open(file: NetaReportFileRecord) {
    if (file.url) setPreview({ displayName: file.source_report_name ?? file.report_name ?? "Report",
      fileName: file.report_name ?? "Report", sourceLabel: `${file.source_label ?? "Report"} · ${file.report_stage ?? "formal"}`, url: file.url });
  }
  return <section aria-label="Duplicate report evidence" className="my-3 space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Duplicate report evidence</h4>
      {editable ? <button type="button" disabled={busy} className="font-medium text-primary underline disabled:opacity-50"
        onClick={() => void submit(true)}>Refresh duplicate evidence</button> : <span className="text-muted-foreground">Duplicate decisions: read only</span>}
    </div>
    {!audit?.available ? <p>Duplicate check unavailable.</p> : <>
      {audit.checked_at && <p className="text-muted-foreground">Evidence checked {new Date(audit.checked_at).toLocaleString()}</p>}
      {!matches.length && <p>No duplicate groups recorded for this equipment.</p>}
      {matches.map((match) => <div key={match.match_id} className="space-y-2 rounded border border-amber-200 bg-background p-3">
        <div className="font-semibold text-amber-900">{duplicateLabel(match)} · {match.report_stage} · {match.category}</div>
        {[match.first, match.second].map((file, index) => <div key={index} className="space-y-1">
          <p className="break-all"><strong>{index === 0 ? "Primary copy" : "Duplicate copy"}:</strong> {file.name}</p>
          <div className="flex flex-wrap gap-3">
            {([file.original, file.gc] as const).map((pdf, source) => pdf?.url ? <button key={source} type="button"
              className="break-all text-left text-primary underline" onClick={() => open(pdf)}>
              Preview {source === 0 ? "Original" : "GC"}: {pdf.report_name}
            </button> : null)}
          </div>
        </div>)}
        {match.confirmation_source && match.status !== "invalid" && <p>{match.confirmation_source === "automatic"
          ? "Automatically confirmed by identical bytes or rendered content."
          : `Manually confirmed by ${match.confirmed_by ?? "user"}${match.confirmed_at ? ` · ${new Date(match.confirmed_at).toLocaleString()}` : ""}`}</p>}
        {match.status === "confirmed" && <p>{match.category === "equipment"
          ? "Tracker skips the duplicate equipment copy during subsequent uploads. Both local PDFs remain available."
          : "Cable copies remain retained for review; this confirmation does not suppress cable uploads."}</p>}
        {match.problems.map((problem, index) => <p key={index} className="text-red-700">{problem}</p>)}
        {editable && (match.can_confirm || match.can_revoke) && <button type="button" disabled={busy}
          className="rounded border px-2 py-1 font-medium disabled:opacity-50"
          onClick={() => setDecision({ match, action: match.can_revoke ? "revoke" : "confirm" })}>
          {match.can_revoke ? "Revoke Confirmation" : "Confirm Duplicate"}
        </button>}
      </div>)}
    </>}
    {!!audit?.errors.length && <details><summary>Duplicate audit diagnostics ({audit.errors.length})</summary>
      {audit.errors.map((message, i) => <p key={i} className="break-all">{typeof message === "string" ? message : JSON.stringify(message)}</p>)}</details>}
    {!editable && identity && <button type="button" className="text-primary underline" onClick={() => setAccessAttempt((value) => value + 1)}>Check operator access</button>}
    {decision && editable && <div role="alertdialog" aria-label="Confirm duplicate decision" className="space-y-2 rounded border bg-background p-3">
      <p className="font-semibold">{decision.action === "confirm" ? "Confirm these reports are duplicates?" : "Revoke this manual confirmation?"}</p>
      <p className="break-all">Primary: {decision.match.first.name}<br />Duplicate: {decision.match.second.name}</p>
      <p>{decision.action === "confirm" ? "Subsequent Tracker uploads may skip the duplicate equipment copy. Both local files remain."
        : "This restores the possible-duplicate state. Attachments already uploaded to CxAlloy will not change."} This action does not start an upload.</p>
      <button type="button" disabled={busy} className="mr-3 rounded border px-2 py-1" onClick={() => void submit()}>Save decision</button>
      <button type="button" disabled={busy} onClick={() => setDecision(null)}>Cancel</button>
    </div>}
    {busy && <p role="status">Updating duplicate evidence…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <ReportPreviewModal preview={preview} onClose={() => setPreview(null)} />
  </section>;
}
