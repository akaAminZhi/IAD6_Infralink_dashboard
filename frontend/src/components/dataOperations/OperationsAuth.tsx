import { ClerkProvider, SignIn, UserButton, useAuth } from "@clerk/react";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

import { getAutomationAccess, setAutomationTokenGetter } from "../../utils/automationApi";
import { isLocalOperationsMode } from "../../utils/localOperations";
import { LoadingState } from "../common/LoadingState";
import { Button } from "../ui/button";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function TokenBridge({ children }: { children: ReactNode }) {
  const { getToken, userId } = useAuth();
  useLayoutEffect(() => {
    setAutomationTokenGetter(getToken);
    return () => setAutomationTokenGetter(null);
  }, [getToken, userId]);
  return children;
}

export function OperationsAuthProvider({ children }: { children: ReactNode }) {
  if (isLocalOperationsMode() || !publishableKey) return children;
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <TokenBridge>{children}</TokenBridge>
    </ClerkProvider>
  );
}

export function OperationsAuthGate({ children }: { children: ReactNode }) {
  if (isLocalOperationsMode()) return <LocalGate>{children}</LocalGate>;
  if (!publishableKey) {
    return <div className="rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">Data Operations</h1>
      <p className="mt-2 text-muted-foreground">Sign-in is not configured. Contact the dashboard administrator.</p>
    </div>;
  }
  return <ConfiguredGate>{children}</ConfiguredGate>;
}

function LocalGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<{ error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    void getAutomationAccess().then(
      () => { if (!cancelled) setAccess({ error: null }); },
      (error: unknown) => {
        if (!cancelled) setAccess({ error: error instanceof Error ? error.message : "Unable to check local access." });
      },
    );
    return () => { cancelled = true; };
  }, [attempt]);
  if (!access) return <LoadingState />;
  if (access.error) return <div className="rounded-lg border bg-card p-6" role="alert">
    <p>{access.error}</p>
    <Button className="mt-4" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
  </div>;
  return children;
}

function ConfiguredGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [access, setAccess] = useState<{ userId: string; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAccess(null);
    if (!isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    void getAutomationAccess().then(
      () => { if (!cancelled) setAccess({ userId, error: null }); },
      (error: unknown) => {
        if (!cancelled) setAccess({ userId, error: error instanceof Error ? error.message : "Unable to check access." });
      },
    );
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, attempt]);
  if (!isLoaded) return <LoadingState />;
  if (!isSignedIn) return (
    <div className="flex flex-col items-center gap-4 py-8">
      <h1 className="text-xl font-semibold">Sign in to Data Operations</h1>
      <p className="text-sm text-muted-foreground">Access is available to invited operators.</p>
      <SignIn routing="hash" forceRedirectUrl="/data-operations" />
    </div>
  );
  if (!access || access.userId !== userId) return <LoadingState />;
  return <>
    <div className="mb-4 flex items-center justify-end gap-3">
      <span className="text-sm text-muted-foreground">Operator account</span>
      <UserButton />
    </div>
    {access.error ? <div className="rounded-lg border bg-card p-6" role="alert">
      <p>{access.error}</p>
      <Button className="mt-4" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
    </div> : children}
  </>;
}
