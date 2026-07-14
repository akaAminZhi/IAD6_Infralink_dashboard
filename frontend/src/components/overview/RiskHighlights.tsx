import { AlertTriangle, CircleAlert, ImageOff, PlugZap, ShieldAlert } from "lucide-react";

import { formatNumber } from "../../utils/summaryUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export interface RiskItem {
  label: string;
  count: number | null;
  description: string;
  severity?: "critical" | "warning" | "neutral";
}

const iconByLabel: Record<string, typeof AlertTriangle> = {
  "Unmatched Module Equipment": PlugZap,
  "Cases Missing Issue Image": ImageOff,
  "NETA Missing Test Reports": ShieldAlert,
  "Open Cases": CircleAlert,
  "Urgent Cases": AlertTriangle,
  "High Priority Cases": CircleAlert,
};

const severityClasses = {
  critical: "border-red-200 bg-red-50/70 text-red-700",
  warning: "border-amber-200 bg-amber-50/70 text-amber-700",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function RiskHighlights({ risks }: { risks: RiskItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Risk Highlights</CardTitle>
        <CardDescription>
          Focus areas for the weekly PDM, issue, and NETA review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {risks.map((risk) => {
            const Icon = iconByLabel[risk.label] ?? AlertTriangle;
            return (
              <div
                className="rounded-lg border bg-background p-4"
                key={risk.label}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-md border p-2 ${
                      severityClasses[risk.severity ?? "neutral"]
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{risk.label}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-normal">
                      {formatNumber(risk.count)}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{risk.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
