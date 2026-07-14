import { KpiCard } from "../common/KpiCard";
import { formatNumber } from "../../utils/formatters";
import type { PdmSummaryMetrics } from "../../utils/pdmUtils";
import { cn } from "../../utils/cn";

interface PdmSummaryCardsProps {
  metrics: PdmSummaryMetrics;
}

const toneClasses = {
  neutral: "",
  positive: "border-emerald-200 bg-emerald-50/60",
  warning: "border-amber-200 bg-amber-50/70",
  critical: "border-red-200 bg-red-50/70",
};

function toneClass(tone: keyof typeof toneClasses) {
  return toneClasses[tone];
}

export function PdmSummaryCards({ metrics }: PdmSummaryCardsProps) {
  const cards = [
    {
      label: "Total PDMs",
      value: metrics.totalPdms,
      description: "PDM records in pdms.json.",
      tone: "neutral" as const,
    },
    {
      label: "Total Equipment",
      value: metrics.totalEquipment,
      description: "Equipment entries under PDMs.",
      tone: "neutral" as const,
    },
    {
      label: "NETA Complete",
      value: metrics.netaComplete,
      description: "Equipment marked complete.",
      tone: "positive" as const,
    },
    {
      label: "NETA Incomplete",
      value: metrics.netaIncomplete,
      description: "False, blank, or not complete.",
      tone: metrics.netaIncomplete > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "NETA Complete Missing Report",
      value: metrics.netaMissingReports,
      description: "Completed NETA without report reference.",
      tone: metrics.netaMissingReports > 0 ? ("critical" as const) : ("neutral" as const),
    },
    {
      label: "PDMs With Open Cases",
      value: metrics.pdmsWithOpenCases,
      description: "PDMs with active equipment cases.",
      tone: metrics.pdmsWithOpenCases > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Total Open Cases",
      value: metrics.totalOpenCases,
      description: "Open cases attached to equipment.",
      tone: metrics.totalOpenCases > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Cases Missing Issue Image",
      value: metrics.casesMissingIssueImage,
      description: "Cases with no issue image value.",
      tone: metrics.casesMissingIssueImage > 0 ? ("critical" as const) : ("neutral" as const),
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard
          className={cn(toneClass(card.tone))}
          description={card.description}
          key={card.label}
          label={card.label}
          value={formatNumber(card.value)}
        />
      ))}
    </section>
  );
}
