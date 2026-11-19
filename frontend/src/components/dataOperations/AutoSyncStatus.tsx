import { AlertTriangle, CircleOff, Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import type { AutoSyncState, AutoSyncStatus as AutoSyncStatusData } from "../../types/automation";
import { cn } from "../../utils/cn";

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const MAX_INTERVAL_MINUTES = 1440;

function currentMinutes(status: AutoSyncStatusData): { light: number; full: number } {
  return {
    light: status.interval_minutes ?? Math.round((status.interval_seconds ?? 600) / 60),
    full: status.full_interval_minutes ?? Math.round((status.full_interval_seconds ?? 3600) / 60),
  };
}

export function validateIntervals(light: string, full: string): string | null {
  const lightValue = Number(light);
  const fullValue = Number(full);
  if (!Number.isInteger(lightValue) || !Number.isInteger(fullValue)) {
    return "Enter whole minutes.";
  }
  if (lightValue < 1 || lightValue > MAX_INTERVAL_MINUTES) {
    return `Light interval must be 1-${MAX_INTERVAL_MINUTES} minutes.`;
  }
  if (fullValue < lightValue || fullValue > MAX_INTERVAL_MINUTES) {
    return `Full interval must be between the light interval and ${MAX_INTERVAL_MINUTES} minutes.`;
  }
  return null;
}

const STATE_LABEL: Record<AutoSyncState, string> = {
  running: "Auto-sync running",
  on: "Auto-sync on",
  waiting_for_idle: "Auto-sync waiting",
  stopped: "Auto-sync stopped",
  off: "Auto-sync off",
};

const STATE_TONE: Record<AutoSyncState, string> = {
  running: "border-emerald-200 bg-emerald-50 text-emerald-900",
  on: "border-emerald-200 bg-emerald-50 text-emerald-900",
  waiting_for_idle: "border-blue-200 bg-blue-50 text-blue-900",
  stopped: "border-amber-300 bg-amber-50 text-amber-950",
  off: "border-border bg-muted/40 text-muted-foreground",
};

const DOT_TONE: Record<AutoSyncState, string> = {
  running: "bg-emerald-500 animate-pulse",
  on: "bg-emerald-500",
  waiting_for_idle: "bg-blue-500",
  stopped: "bg-amber-500",
  off: "bg-slate-400",
};

function resolve(status: AutoSyncStatusData | undefined): AutoSyncStatusData {
  return status ?? { state: "off", armed: false };
}

export function AutoSyncBadge({ status }: { status: AutoSyncStatusData | undefined }) {
  const current = resolve(status);
  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="auto-sync-badge"
    >
      <span className={cn("h-2 w-2 rounded-full", DOT_TONE[current.state])} />
      {STATE_LABEL[current.state]}
    </span>
  );
}

interface AutoSyncPanelProps {
  status: AutoSyncStatusData | undefined;
  onShowRun?: (runId: string) => void;
  onSaveIntervals?: (lightMinutes: number, fullMinutes: number) => Promise<void>;
}

export function AutoSyncPanel({ status, onShowRun, onSaveIntervals }: AutoSyncPanelProps) {
  const current = resolve(status);
  const saved = currentMinutes(current);
  const [light, setLight] = useState(String(saved.light));
  const [full, setFull] = useState(String(saved.full));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow server values unless the operator is editing.
  useEffect(() => {
    if (!editing) {
      setLight(String(saved.light));
      setFull(String(saved.full));
    }
  }, [editing, saved.light, saved.full]);

  const dirty = light !== String(saved.light) || full !== String(saved.full);

  async function save() {
    const problem = validateIntervals(light, full);
    if (problem) {
      setError(problem);
      return;
    }
    if (!onSaveIntervals) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveIntervals(Number(light), Number(full));
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save intervals.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
    setLight(String(saved.light));
    setFull(String(saved.full));
  }

  let icon = <CircleOff className="h-4 w-4 shrink-0" />;
  let detail: string;
  if (current.state === "running") {
    icon = <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />;
    detail = `Running ${current.active_mode === "full" ? "full" : "light"} sync${
      current.current_step ? ` · ${current.current_step}` : ""
    }`;
  } else if (current.state === "on") {
    icon = <Clock className="h-4 w-4 shrink-0" />;
    detail = `Next light sync ${formatTime(current.next_run_at)} · next full ≈ ${formatTime(
      current.next_full_at,
    )} · last success ${formatTime(current.last_success_at)}`;
  } else if (current.state === "waiting_for_idle") {
    icon = <Clock className="h-4 w-4 shrink-0" />;
    detail = "Sync is due; it will run after the current task finishes.";
  } else if (current.state === "stopped") {
    icon = <AlertTriangle className="h-4 w-4 shrink-0" />;
    detail = `Stopped: ${current.stopped_reason ?? "unknown reason"} Run Daily Data Refresh to resume.`;
  } else {
    detail = "Starts after a successful manual Daily Data Refresh and runs until the service restarts.";
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-sm",
        STATE_TONE[current.state],
      )}
      data-testid="auto-sync-panel"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="font-semibold">{STATE_LABEL[current.state]}</span>
        <span className="min-w-0 break-words">{detail}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {onSaveIntervals ? (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="flex items-center gap-1.5">
              <span className="opacity-80">Light every</span>
              <input
                aria-label="Light sync interval (minutes)"
                className="h-7 w-14 rounded-md border bg-background px-1.5 text-right text-xs text-foreground"
                inputMode="numeric"
                max={MAX_INTERVAL_MINUTES}
                min={1}
                onChange={(event) => {
                  setEditing(true);
                  setLight(event.target.value);
                }}
                type="number"
                value={light}
              />
              <span className="opacity-80">min · full every</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                aria-label="Full sync interval (minutes)"
                className="h-7 w-14 rounded-md border bg-background px-1.5 text-right text-xs text-foreground"
                inputMode="numeric"
                max={MAX_INTERVAL_MINUTES}
                min={1}
                onChange={(event) => {
                  setEditing(true);
                  setFull(event.target.value);
                }}
                type="number"
                value={full}
              />
              <span className="opacity-80">min</span>
            </label>
            {dirty ? (
              <>
                <button
                  className="h-7 rounded-md bg-primary px-2 font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button className="h-7 px-1 font-semibold underline" onClick={cancelEdit} type="button">
                  Reset
                </button>
              </>
            ) : null}
            {error ? (
              <span className="basis-full text-red-700" role="alert">
                {error}
              </span>
            ) : null}
          </form>
        ) : (
          <span className="opacity-80">
            Light every {saved.light} min · full every {saved.full} min
          </span>
        )}
        {current.state === "running" && current.active_run_id && onShowRun ? (
          <button
            className="font-semibold underline"
            onClick={() => onShowRun(current.active_run_id as string)}
            type="button"
          >
            View log
          </button>
        ) : null}
      </div>
    </div>
  );
}
