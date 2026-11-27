import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useOperationsIdentity } from "../dataOperations/OperationsAuth";
import { Button } from "../ui/button";
import {
  getNetaVersionMatches, getNetaVersionPdf, saveNetaVersionDecision,
  type NetaVersionChoice, type NetaVersionMatch,
} from "../../utils/automationApi";

function VersionPair({ match }: { match: NetaVersionMatch }) {
  const [expanded, setExpanded] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [decision, setDecision] = useState(match.decision);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const created: string[] = [];
    void Promise.all([
      getNetaVersionPdf(match, "current", controller.signal),
      getNetaVersionPdf(match, "candidate", controller.signal),
    ]).then(blobs => {
      if (controller.signal.aborted) return;
      created.push(...blobs.map(blob => URL.createObjectURL(blob)));
      setUrls(created);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to open these reports.");
    });
    return () => {
      controller.abort();
      created.forEach(url => URL.revokeObjectURL(url));
    };
  }, [expanded, match]);

  async function decide(choice: NetaVersionChoice) {
    setSaving(true);
    setError("");
    try {
      const result = await saveNetaVersionDecision(match, choice);
      setDecision(result.decision);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to save this choice.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="space-y-3 rounded-md border bg-card p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{match.candidate.identifier || match.candidate.name}</span>
      <Button variant="outline" className="h-8 px-2 text-xs" aria-expanded={expanded} onClick={() => {
        setUrls([]);
        setError("");
        setExpanded(!expanded);
      }}>{expanded ? "Close previews" : "Compare PDFs"}</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["current", "candidate"] as const).map((side, index) => {
        const file = match[side];
        const label = side === "current" ? "Current version" : "Candidate version";
        return <div key={side} className="min-w-0 space-y-1 border-t pt-2 text-xs">
          <p className="font-semibold">{label}</p>
          <p className="break-words">{file.name}</p>
          <p className="text-muted-foreground">{file.source === "main" ? "NETA Test Report" : "Infralink Updates"}</p>
          <p className="text-muted-foreground">{file.uploaded_at ? new Date(file.uploaded_at).toLocaleString() : "Upload time unavailable"}</p>
          <p>{file.verdict || "Assessment unavailable"}</p>
          {expanded && urls[index] && <iframe title={`${label} PDF`} src={urls[index]} className="h-72 w-full rounded border" />}
        </div>;
      })}
    </div>
    {expanded && !urls.length && !error && <p role="status" className="text-xs text-muted-foreground">Opening PDF previews…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {decision ? <p role="status" className="text-xs text-muted-foreground">
      {decision === "keep" ? "Current version selected." : "Candidate version selected."} Run the manual NETA refresh to apply this choice.
    </p> : expanded && <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-8 px-2 text-xs" disabled={saving || urls.length !== 2} onClick={() => void decide("keep")}>Keep current</Button>
      <Button className="h-8 px-2 text-xs" disabled={saving || urls.length !== 2} onClick={() => void decide("adopt")}>Use candidate</Button>
    </div>}
  </article>;
}

export function NetaVersionReview({ equipmentId }: { equipmentId: string | null }) {
  const identity = useOperationsIdentity();
  const [matches, setMatches] = useState<NetaVersionMatch[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setMatches([]);
    setError("");
    if (identity && equipmentId) void getNetaVersionMatches(equipmentId).then(result => {
      if (current) setMatches(result.matches);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Unable to check report versions.");
    });
    return () => { current = false; };
  }, [equipmentId, identity]);

  if (!identity) return null;
  if (error) return <p role="alert" className="text-xs text-muted-foreground">{error}</p>;
  if (!matches.length) return null;
  return <section className="space-y-2" aria-label="Pending NETA report versions">
    <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" /> Pending report versions</h3>
    {matches.map(match => <VersionPair key={match.revision} match={match} />)}
  </section>;
}
