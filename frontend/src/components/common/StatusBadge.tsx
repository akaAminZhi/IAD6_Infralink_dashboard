import { cn } from "../../utils/cn";

interface StatusBadgeProps {
  children: string;
  tone?: "default" | "success" | "teal" | "warning" | "danger" | "muted";
}

const toneClasses = {
  default: "border-primary/20 bg-primary/10 text-primary",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  teal: "border-teal-200 bg-teal-50 text-teal-800",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ children, tone = "default" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
