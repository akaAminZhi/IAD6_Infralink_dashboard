import { createContext, useContext, type ReactNode } from "react";

import type { IssueAttachmentManifest } from "../types/data";

const IssueAttachmentManifestContext = createContext<IssueAttachmentManifest | null>(null);

interface IssueAttachmentManifestProviderProps {
  children: ReactNode;
  manifest: IssueAttachmentManifest | null;
}

export function IssueAttachmentManifestProvider({
  children,
  manifest,
}: IssueAttachmentManifestProviderProps) {
  return (
    <IssueAttachmentManifestContext.Provider value={manifest}>
      {children}
    </IssueAttachmentManifestContext.Provider>
  );
}

export function useIssueAttachmentManifest(): IssueAttachmentManifest | null {
  return useContext(IssueAttachmentManifestContext);
}
