import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

interface PlaceholderPageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <section className="mx-auto w-full max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </section>
  );
}
