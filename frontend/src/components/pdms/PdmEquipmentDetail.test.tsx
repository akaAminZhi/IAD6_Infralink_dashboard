import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InfralinkEquipmentLinksProvider } from "../../contexts/InfralinkEquipmentLinksContext";
import { CxalloyEquipmentLinksProvider } from "../../contexts/CxalloyEquipmentLinksContext";
import { PdmEquipmentDetail } from "./PdmEquipmentDetail";

describe("PDM equipment detail", () => {
  it("links matched equipment to its own Infralink detail", () => {
    render(<InfralinkEquipmentLinksProvider records={[
      { equipment_id: "IAD06-PDU6-01E-2", infralink_id: "1301515161" },
    ]}><CxalloyEquipmentLinksProvider records={[
      { equipment_id: "IAD06-PDU6-01E-2", project_id: "49402", cxalloy_id: "77", cxalloy_name: "PDU6-01E-2" },
    ]}><PdmEquipmentDetail equipment={{ equipment_id: "IAD06-PDU6-01E-2", match_status: "matched" }} epsTestItems={[]} /></CxalloyEquipmentLinksProvider></InfralinkEquipmentLinksProvider>);
    expect(screen.getByRole("link", { name: "Open in Infralink" })).toHaveAttribute("href", "https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=1301515161");
    expect(screen.getByRole("link", { name: "Open in CxAlloy" })).toHaveAttribute("href", "https://tq.cxalloy.com/project/49402/equipment/77");
  });
});
