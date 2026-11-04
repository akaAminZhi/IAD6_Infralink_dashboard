import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CxalloyEquipmentLinksProvider } from "../../contexts/CxalloyEquipmentLinksContext";
import { InfralinkEquipmentLinksProvider } from "../../contexts/InfralinkEquipmentLinksContext";
import type { CxalloyEquipmentLink as LinkRecord } from "../../types/data";
import { clearPendingJsonRequests } from "../../utils/dataLoaders";
import { CxalloyEquipmentLink } from "./CxalloyEquipmentLink";
import { EquipmentExternalLinks } from "./EquipmentExternalLinks";

const record = (equipmentId = "IAD06-PDU6-01E-2", identifier = "123"): LinkRecord => ({
  equipment_id: equipmentId, cxalloy_id: identifier, project_id: "49402", cxalloy_name: equipmentId,
});

afterEach(() => { vi.restoreAllMocks(); clearPendingJsonRequests(); });

describe("CxAlloy equipment links", () => {
  it("does not fetch until a detail link mounts, then shares the request across links", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ records: [record()] })));
    const view = (details: boolean) => <CxalloyEquipmentLinksProvider>
      {details ? <><CxalloyEquipmentLink equipmentId="iad06-pdu6-01e-2" /><CxalloyEquipmentLink equipmentId="missing" /></> : <span>List</span>}
    </CxalloyEquipmentLinksProvider>;
    const { rerender } = render(view(false));
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    rerender(view(true));
    const link = await screen.findByRole("link", { name: "Open in CxAlloy" });
    expect(link).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/data/cxalloy_equipment_links.json", { cache: "no-cache" });
  });

  it("preserves cable identities and rejects ambiguous, unknown and unsafe identities", () => {
    render(<CxalloyEquipmentLinksProvider records={[
      record("FDR-IAD06-A-IAD06-B"), record("duplicate", "1"), record("duplicate", "2"),
      record("unsafe", "../other"), { ...record("unsafe-project"), project_id: "../49402" },
      record("same", "7"), record("same", "7"),
    ]}>
      {["FDR-IAD06-A-IAD06-B", "IAD06-A", "duplicate", "unsafe", "unsafe-project", "same"].map(id =>
        <CxalloyEquipmentLink key={id} equipmentId={id} />)}
      <CxalloyEquipmentLink equipmentId="FDR-IAD06-A-IAD06-B" matchStatus="ambiguous" />
      <CxalloyEquipmentLink equipmentId={null} />
    </CxalloyEquipmentLinksProvider>);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getAllByText("CxAlloy link unavailable")).toHaveLength(6);
  });

  it("keeps Infralink usable alongside a missing CxAlloy identity", () => {
    render(<InfralinkEquipmentLinksProvider records={[{ equipment_id: "EQ", infralink_id: "1" }]}>
      <CxalloyEquipmentLinksProvider records={[]}><EquipmentExternalLinks equipmentId="EQ" /></CxalloyEquipmentLinksProvider>
    </InfralinkEquipmentLinksProvider>);
    expect(screen.getByRole("link", { name: "Open in Infralink" })).toBeInTheDocument();
    expect(screen.getByText("CxAlloy link unavailable")).toBeInTheDocument();
  });

  it("keeps details usable without the dataset", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<CxalloyEquipmentLinksProvider><CxalloyEquipmentLink equipmentId="EQ" /></CxalloyEquipmentLinksProvider>);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(screen.getByText("CxAlloy link unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("clears stale links on reload and ignores late results from a previous generation", async () => {
    let finishOld: ((response: Response) => void) | undefined;
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify([record("EQ", "2")])))
      .mockResolvedValueOnce(new Response(JSON.stringify([record("EQ", "3")])));
    const view = (refreshKey: string) => <CxalloyEquipmentLinksProvider refreshKey={refreshKey}>
      <CxalloyEquipmentLink equipmentId="EQ" />
    </CxalloyEquipmentLinksProvider>;
    const { rerender } = render(view("old"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // useDashboardData.reload clears shared pending requests before changing the key.
    clearPendingJsonRequests();
    rerender(view("new"));
    expect(await screen.findByRole("link")).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/2");
    await act(async () => { finishOld?.(new Response(JSON.stringify([record("EQ", "1")]))); });
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/2");
    rerender(view("latest"));
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/3"));
  });
});
