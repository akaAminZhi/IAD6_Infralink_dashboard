import type { LucideIcon } from "lucide-react";

import { KpiCard } from "../common/KpiCard";

export interface OverviewKpi {
  label: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  tone?: "neutral" | "positive" | "warning" | "critical" | "progress";
  targetPath?: string;
}

const toneClasses: Record<NonNullable<OverviewKpi["tone"]>, string> = {
  neutral: "border-slate-200 bg-slate-50/60",
  positive: "border-emerald-200 bg-emerald-50/60",
  warning: "border-amber-200 bg-amber-50/70",
  critical: "border-red-300 bg-red-50/80",
  progress: "border-blue-200 bg-blue-50/70",
};

export function OverviewKpiGrid({
  kpis,
  onKpiClick,
}: {
  kpis: OverviewKpi[];
  onKpiClick?: (kpi: OverviewKpi) => void;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const card = (
          <KpiCard
            className={`${toneClasses[kpi.tone ?? "neutral"]} h-full`}
            description={kpi.description}
            icon={Icon ? <Icon className={`h-5 w-5 ${kpi.iconClassName ?? ""}`} /> : undefined}
            label={kpi.label}
            value={kpi.value}
          />
        );

        if (!kpi.targetPath || !onKpiClick) {
          return <div key={kpi.label}>{card}</div>;
        }

        return (
          <button
            className="w-full text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={kpi.label}
            onClick={() => onKpiClick(kpi)}
            type="button"
          >
            {card}
          </button>
        );
      })}
    </section>
  );
}
