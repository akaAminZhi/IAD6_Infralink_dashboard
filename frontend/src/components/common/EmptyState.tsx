import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-card-foreground">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
