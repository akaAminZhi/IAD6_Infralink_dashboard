import { CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  NetaBaselineException,
  NetaBaselinePosition,
  NetaPositionBaselines,
  NetaPositionFamily,
} from "../../types/netaPositions";
import {
  deleteNetaPositionBaseline,
  runAutomationJob,
  saveNetaPositionBaseline,
} from "../../utils/automationApi";
import { Button } from "../ui/button";

interface NetaBaselineEditorProps {
  family: NetaPositionFamily;
  baselines: NetaPositionBaselines | null;
  editable: boolean;
  onSaved: (baselines: NetaPositionBaselines) => void;
}

const splitKeys = (text: string) =>
  [...new Set(text.split(/[,\n]/).map((item) => item.trim().toUpperCase()).filter(Boolean))];

function initialPositions(family: NetaPositionFamily, baselines: NetaPositionBaselines | null): NetaBaselinePosition[] {
  const confirmed = baselines?.families[family.family];
  if (confirmed) return confirmed.positions.map((position) => ({ ...position, aliases: [...position.aliases] }));
  return family.draft.positions.map((key) => ({ key, count: 1, optional: false, aliases: [] }));
}

export function NetaBaselineEditor({ family, baselines, editable, onSaved }: NetaBaselineEditorProps) {
  const confirmed = baselines?.families[family.family] ?? null;
  const [positions, setPositions] = useState(() => initialPositions(family, baselines));
  const [exceptions, setExceptions] = useState<Record<string, NetaBaselineException>>(
    () => structuredClone(confirmed?.exceptions ?? {}),
  );
  const [newKey, setNewKey] = useState("");
  const [exceptionTarget, setExceptionTarget] = useState(family.members[0] ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);

  const keys = positions.map((position) => position.key);
  const candidates = useMemo(
    () => Object.entries(family.draft.support).filter(([key]) => !keys.includes(key)).sort((a, b) => b[1] - a[1]),
    [family.draft.support, keys],
  );
  const disabled = !editable || busy || baselines === null;

  const update = (index: number, patch: Partial<NetaBaselinePosition>) =>
    setPositions((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const addKey = (key: string) => {
    const value = key.trim().toUpperCase();
    if (!value || keys.includes(value)) return;
    setPositions((items) => [...items, { key: value, count: 1, optional: false, aliases: [] }].sort((a, b) => a.key.localeCompare(b.key)));
    setNewKey("");
  };
  const exception = exceptions[exceptionTarget] ?? { waived_positions: [], extra_positions: [], note: "" };
  const setException = (patch: Partial<NetaBaselineException>) =>
    setExceptions((items) => ({ ...items, [exceptionTarget]: { ...exception, ...patch } }));

  const save = async () => {
    if (!baselines) return;
    setBusy(true);
    setMessage(null);
    try {
      const cleaned = Object.fromEntries(Object.entries(exceptions).map(([id, item]) => [id, {
        ...item, waived_positions: item.waived_positions.filter((key) => keys.includes(key)),
      }]));
      const result = await saveNetaPositionBaseline(family.family, { positions, exceptions: cleaned }, baselines.revision);
      onSaved(result);
      setSavedRevision(result.revision);
      setMessage({ tone: "ok", text: `Baseline confirmed (revision ${result.revision}). Run the dashboard ETL to re-compare.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  const revert = async () => {
    if (!baselines || !confirmed) return;
    setBusy(true);
    try {
      const result = await deleteNetaPositionBaseline(family.family, baselines.revision);
      onSaved(result);
      setPositions(family.draft.positions.map((key) => ({ key, count: 1, optional: false, aliases: [] })));
      setExceptions({});
      setSavedRevision(result.revision);
      setMessage({ tone: "ok", text: "Confirmed baseline removed; the draft is used again after the next ETL." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  const runEtl = async () => {
    try {
      await runAutomationJob("run_dashboard_etl");
      setMessage({ tone: "ok", text: "Dashboard ETL started. Reload this page when it finishes (Data Operations shows progress)." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="mt-5 rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="text-sm font-semibold">
          Baseline editor
          <span className="ml-2 font-normal text-muted-foreground">
            {confirmed ? `confirmed ${confirmed.confirmed_at ?? ""} by ${confirmed.confirmed_by ?? "?"}` : "not confirmed: starting from the draft"}
          </span>
        </div>
        <div className="flex gap-2">
          {confirmed ? (
            <Button disabled={disabled} onClick={revert} className="h-8 px-3 text-xs" variant="outline"><RotateCcw className="mr-1 h-4 w-4" />Revert to draft</Button>
          ) : null}
          <Button disabled={disabled || positions.length === 0} onClick={save} className="h-8 px-3 text-xs"><CheckCircle2 className="mr-1 h-4 w-4" />Confirm baseline</Button>
        </div>
      </div>
      {!editable ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {baselines === null ? "Baseline service unavailable; read-only." : "Only the local operator can confirm baselines; read-only."}
        </p>
      ) : null}
      {message ? (
        <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-destructive"}`}>
          {message.text}
          {message.tone === "ok" && savedRevision !== null ? (
            <Button onClick={runEtl} className="h-8 px-3 text-xs" variant="outline">Run dashboard ETL</Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1">Position</th><th className="py-1">Aliases</th><th className="py-1">Count</th><th className="py-1">Optional</th><th className="py-1">Support</th><th /></tr>
            </thead>
            <tbody>
              {positions.map((position, index) => (
                <tr className="border-t" key={position.key}>
                  <td className="py-1 pr-2 font-mono">{position.key}</td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`Aliases for ${position.key}`}
                      className="h-7 w-full rounded border bg-background px-1 font-mono"
                      defaultValue={position.aliases.join(", ")}
                      disabled={disabled}
                      onBlur={(event) => update(index, { aliases: splitKeys(event.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Count for ${position.key}`} className="h-7 w-14 rounded border bg-background px-1" disabled={disabled} max={20} min={1}
                      onChange={(event) => update(index, { count: Math.max(1, Number(event.target.value) || 1) })} type="number" value={position.count} />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input aria-label={`Optional ${position.key}`} checked={position.optional} disabled={disabled}
                      onChange={(event) => update(index, { optional: event.target.checked })} type="checkbox" />
                  </td>
                  <td className="py-1 pr-2 text-muted-foreground">{family.draft.support[position.key] ?? 0}/{family.draft.complete_member_count}</td>
                  <td className="py-1">
                    <button aria-label={`Remove ${position.key}`} className="text-muted-foreground hover:text-destructive disabled:opacity-40" disabled={disabled}
                      onClick={() => setPositions((items) => items.filter((_, i) => i !== index))} type="button">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-2">
            <input aria-label="New position" className="h-8 flex-1 rounded border bg-background px-2 font-mono text-xs" disabled={disabled}
              onChange={(event) => setNewKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addKey(newKey); }}
              placeholder="Add position key, e.g. FB9-PRI" value={newKey} />
            <Button disabled={disabled || !newKey.trim()} onClick={() => addKey(newKey)} className="h-8 px-3 text-xs" variant="outline"><Plus className="mr-1 h-4 w-4" />Add</Button>
          </div>
          {candidates.length ? (
            <div className="mt-2 flex flex-wrap gap-1 text-xs">
              <span className="text-muted-foreground">Seen in reports:</span>
              {candidates.map(([key, count]) => (
                <button className="rounded border px-1.5 font-mono hover:bg-accent disabled:opacity-50" disabled={disabled} key={key} onClick={() => addKey(key)} type="button">
                  +{key} ({count})
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-2 text-xs">
          <div className="font-semibold">Equipment exception</div>
          <select aria-label="Exception equipment" className="h-8 w-full rounded border bg-background px-2" onChange={(event) => setExceptionTarget(event.target.value)} value={exceptionTarget}>
            {family.members.map((id) => <option key={id} value={id}>{id}{exceptions[id] ? " *" : ""}</option>)}
          </select>
          <div>
            <div className="mb-1 text-muted-foreground">Waived positions (not required for this equipment)</div>
            <div className="flex flex-wrap gap-2">
              {keys.map((key) => (
                <label className="inline-flex items-center gap-1 font-mono" key={key}>
                  <input checked={exception.waived_positions.includes(key)} disabled={disabled} type="checkbox"
                    onChange={(event) => setException({
                      waived_positions: event.target.checked
                        ? [...exception.waived_positions, key]
                        : exception.waived_positions.filter((item) => item !== key),
                    })} />
                  {key}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-muted-foreground">Extra positions for this equipment</span>
            <input className="mt-1 h-8 w-full rounded border bg-background px-2 font-mono" disabled={disabled} key={`${exceptionTarget}-extra`}
              defaultValue={exception.extra_positions.map((item) => item.key).join(", ")}
              onBlur={(event) => setException({
                extra_positions: splitKeys(event.target.value).filter((key) => !keys.includes(key))
                  .map((key) => ({ key, count: 1, optional: false, aliases: [] })),
              })} />
          </label>
          <label className="block">
            <span className="text-muted-foreground">Note</span>
            <input className="mt-1 h-8 w-full rounded border bg-background px-2" disabled={disabled} key={`${exceptionTarget}-note`}
              defaultValue={exception.note} onBlur={(event) => setException({ note: event.target.value })} />
          </label>
        </div>
      </div>
    </div>
  );
}
