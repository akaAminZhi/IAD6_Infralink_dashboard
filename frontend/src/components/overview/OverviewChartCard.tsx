import type { ReactNode } from "react";

import { EmptyState } from "../common/EmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface OverviewChartCardProps {
  title: string;
  description?: string;
  isEmpty?: boolean;
  children: ReactNode;
}

export function OverviewChartCard({
  title,
  description,
  isEmpty = false,
  children,
}: OverviewChartCardProps) {
  return (
    <Card className="min-h-[320px]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            title="No data available"
            description="Run the ETL or review source files for this section."
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
