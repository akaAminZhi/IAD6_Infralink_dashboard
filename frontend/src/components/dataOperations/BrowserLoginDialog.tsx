import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle, X } from "lucide-react";

import type { BrowserLoginAction, BrowserLoginSession } from "../../types/automation";
import { browserLoginAction, closeBrowserLogin, startBrowserLogin } from "../../utils/automationApi";
import { Button } from "../ui/button";

interface Props {
  provider: "jc2" | "cxalloy";
  onClose: () => void;
  onSaved: () => void;
}

export function BrowserLoginDialog({ provider, onClose, onSaved }: Props) {
  const [session, setSession] = useState<BrowserLoginSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const sessionId = useRef<string | null>(null);
  const alive = useRef(false);
  const queued = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const saved = useRef(false);
  const callbacks = useRef({ onClose, onSaved });
  callbacks.current = { onClose, onSaved };

  function send(action: BrowserLoginAction) {
    pending.current += 1;
    queued.current = queued.current.then(async () => {
      if (!alive.current || !sessionId.current) return;
      try {
        const next = await browserLoginAction(sessionId.current, action);
        if (!alive.current) return;
        setSession(current => ({ ...next, image: next.image ?? current?.image }));
        setError(null);
        if (next.status === "saved" && !saved.current) {
          saved.current = true;
          callbacks.current.onSaved();
          callbacks.current.onClose();
        }
      } catch (reason) {
        if (alive.current) setError(reason instanceof Error ? reason.message : "Login window is unavailable.");
      }
    }).finally(() => { pending.current -= 1; });
  }

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (cancelled) return;
      if (pending.current === 0) send({ kind: "screen" });
      timer = setTimeout(() => void poll(), 1000);
    }
    void startBrowserLogin(provider).then(next => {
      if (cancelled) { void closeBrowserLogin(next.session_id).catch(() => undefined); return; }
      sessionId.current = next.session_id;
      setSession(next);
      void poll();
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to open login.");
    });
    return () => {
      cancelled = true;
      alive.current = false;
      clearTimeout(timer);
      if (sessionId.current) void closeBrowserLogin(sessionId.current).catch(() => undefined);
    };
  }, [provider]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "a") { event.preventDefault(); send({ kind: "key", key: "Control+A" }); }
      return;
    }
    const keys = ["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
    if (keys.includes(event.key)) {
      event.preventDefault();
      send({ kind: "key", key: event.key === "Tab" && event.shiftKey ? "Shift+Tab" : event.key });
    } else if (event.key.length === 1 && !event.altKey) {
      event.preventDefault(); send({ kind: "text", text: event.key });
    }
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3">
    <section role="dialog" aria-modal="true" aria-label={`${provider.toUpperCase()} personal login`}
      className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-auto rounded-lg border bg-background shadow-2xl">
      <header className="flex items-start justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Connect your {provider.toUpperCase()} account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Click the login fields below and type. This window belongs to your dashboard account.</p>
          {provider === "jc2" ? <p className="mt-1 text-sm">Complete Microsoft sign-in and approve MFA on your phone when prompted.</p> : null}
        </div>
        <button aria-label="Close personal login" onClick={onClose} type="button"><X className="h-5 w-5" /></button>
      </header>
      {error || session?.error ? <p role="alert" className="m-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error ?? session?.error}</p> : null}
      {session?.blocked_host ? <p className="mx-3 text-sm text-amber-800">Login needs an additional site ({session.blocked_host}). Contact the dashboard administrator.</p> : null}
      {session?.image && session.status === "ready" ? <div tabIndex={0} onKeyDown={keyDown}
        onPaste={event => { event.preventDefault(); send({ kind: "text", text: event.clipboardData.getData("text").slice(0, 4096) }); }}
        className="mx-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <img src={session.image} alt="Your personal provider login browser" className="block w-full"
          onClick={event => {
            event.currentTarget.parentElement?.focus();
            const rect = event.currentTarget.getBoundingClientRect();
            send({ kind: "click", x: Math.min(session.width - 1, Math.max(0, (event.clientX - rect.left) / rect.width * session.width)),
              y: Math.min(session.height - 1, Math.max(0, (event.clientY - rect.top) / rect.height * session.height)) });
          }} />
      </div> : <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        {session?.status === "closed" ? "Login window expired. Close and start again." : session?.status === "failed" ? "Unable to start login." : <><LoaderCircle className="h-4 w-4 animate-spin" />Opening login window…</>}
      </div>}
      <footer className="flex flex-wrap items-center gap-2 border-t p-3">
        <input aria-label="Text for selected login field" type="password" autoComplete="off" value={entry} maxLength={4096}
          onChange={event => setEntry(event.target.value)} placeholder="Type or paste for the selected field"
          className="h-9 min-w-64 flex-1 rounded border bg-background px-3 text-sm" />
        <Button variant="outline" disabled={session?.status !== "ready" || !entry} onClick={() => { send({ kind: "text", text: entry }); setEntry(""); }}>Send text</Button>
        <Button variant="outline" disabled={session?.status !== "ready"} onClick={() => send({ kind: "key", key: "Tab" })}>Tab</Button>
        <Button variant="outline" disabled={session?.status !== "ready"} onClick={() => send({ kind: "key", key: "Enter" })}>Enter</Button>
        <Button variant="outline" disabled={session?.status !== "ready"} onClick={() => send({ kind: "scroll", delta: 500 })}>Scroll down</Button>
        <Button disabled={session?.status !== "ready"} onClick={() => send({ kind: "save" })}>Save my session</Button>
      </footer>
    </section>
  </div>;
}
