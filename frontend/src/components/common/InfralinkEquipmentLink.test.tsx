import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InfralinkEquipmentLinksProvider } from "../../contexts/InfralinkEquipmentLinksContext";
import { InfralinkEquipmentLink } from "./InfralinkEquipmentLink";

afterEach(() => vi.restoreAllMocks());

describe("Infralink equipment links", () => {
  it("does not download device identities until a detail link is mounted", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([])));
    render(<InfralinkEquipmentLinksProvider><span>PDM list</span></InfralinkEquipmentLinksProvider>);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens the exact device through JC2's sign-in-capable full-page entry", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ records: [
      { equipment_id: "IAD06-PDU6-01E-2", infralink_id: "1301515161" },
      { equipment_id: "FDR-IAD06-A-IAD06-B", infralink_id: "456" },
    ] })));
    render(<InfralinkEquipmentLinksProvider><InfralinkEquipmentLink equipmentId="iad06-pdu6-01e-2" /></InfralinkEquipmentLinksProvider>);
    const link = await screen.findByRole("link", { name: "Open in Infralink" });
    expect(link).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=1301515161");
    expect(new URL(link.getAttribute("href")!).pathname).toBe("/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(fetch).toHaveBeenCalledWith("/data/infralink_equipment_links.json", { cache: "no-cache" });
  });

  it("does not guess unknown, ambiguous, or unsafe identities, and preserves the whole cable ID", () => {
    const { rerender } = render(<InfralinkEquipmentLinksProvider records={[
      { equipment_id: "FDR-IAD06-A-IAD06-B", infralink_id: "456" },
      { equipment_id: "duplicate", infralink_id: "1" }, { equipment_id: "duplicate", infralink_id: "2" },
      { equipment_id: "unsafe", infralink_id: "../other" },
    ]}>
      <InfralinkEquipmentLink equipmentId="FDR-IAD06-A-IAD06-B" />
      <InfralinkEquipmentLink equipmentId="IAD06-A" />
      <InfralinkEquipmentLink equipmentId="duplicate" />
      <InfralinkEquipmentLink equipmentId="unsafe" />
      <InfralinkEquipmentLink equipmentId="FDR-IAD06-A-IAD06-B" matchStatus="ambiguous" />
    </InfralinkEquipmentLinksProvider>);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=456");
    expect(screen.getAllByText("Infralink link unavailable")).toHaveLength(4);
    rerender(<InfralinkEquipmentLinksProvider records={[]}><InfralinkEquipmentLink equipmentId={null} /></InfralinkEquipmentLinksProvider>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the detail usable when no link dataset is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<InfralinkEquipmentLinksProvider><InfralinkEquipmentLink equipmentId="EQ-1" /></InfralinkEquipmentLinksProvider>);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(screen.getByText("Infralink link unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("refreshes identities when dashboard ETL metadata changes", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ equipment_id: "EQ-1", infralink_id: "123" }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ equipment_id: "EQ-1", infralink_id: "456" }])));
    const { rerender } = render(<InfralinkEquipmentLinksProvider refreshKey="first"><InfralinkEquipmentLink equipmentId="EQ-1" /></InfralinkEquipmentLinksProvider>);
    expect(await screen.findByRole("link")).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=123");
    rerender(<InfralinkEquipmentLinksProvider refreshKey="second"><InfralinkEquipmentLink equipmentId="EQ-1" /></InfralinkEquipmentLinksProvider>);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=456"));
  });
});
