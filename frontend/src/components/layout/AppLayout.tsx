import type { ReactNode } from "react";

import type { EtlRunMetadata } from "../../types/data";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
  etlRunMetadata: EtlRunMetadata | null;
}

export function AppLayout({ children, etlRunMetadata }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header etlRunMetadata={etlRunMetadata} />
          <main className="flex-1 px-5 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
