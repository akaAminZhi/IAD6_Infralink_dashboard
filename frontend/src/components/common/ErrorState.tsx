import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5" aria-hidden="true" />
        <div className="space-y-2">
          <p>{message}</p>
          {onRetry ? (
            <button
              className="rounded-md border border-destructive/30 px-3 py-1 text-xs font-medium hover:bg-destructive/10"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
