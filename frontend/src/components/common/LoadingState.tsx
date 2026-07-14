import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-lg border bg-card text-card-foreground">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading dashboard data
      </div>
    </div>
  );
}
