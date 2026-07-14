import type { ReactNode } from "react";

import { cn } from "../../utils/cn";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function KpiCard({ label, value, description, icon, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 text-card-foreground", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-medium text-muted-foreground">{label}</div>
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 text-muted-foreground ring-1 ring-border/70">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
      {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
    </div>
  );
}
