import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { EquipmentPage } from "./EquipmentPage";

describe("EquipmentPage", () => {
  it("shows current columns, excludes resolved cases from open count, and opens asset details", async () => {
    const user = userEvent.setup();
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "IAD06-PDM-E6-210-01",
          equipment: [
            {
              equipment_id: "IAD06-PDU6-01D-4",
              source_equipment_label: "PDU6-01D-4",
              status: "Conditional Yellow Tag",
              neta_complete: true,
              neta_test_report: "Report-01.pdf",
              cases: [
                {
                  case_id: "CASE-RESOLVED",
                  status: "Resolved",
                  summary: "Resolved issue",
                },
              ],
            },
          ],
        },
      ],
      equipment: [
        {
          equipment_id: "IAD06-PDU6-01D-4",
          equipment_type: "Power Distribution Unit",
          manufacturer: "IEM",
          model: "PDU54SHAM",
          serial_number: "J02PDU000-00032",
          neta_complete: true,
          neta_test_report: "Report-01.pdf",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/equipment"]}>
        <NetaReportManifestProvider manifest={null}>
          <EquipmentPage data={data} />
        </NetaReportManifestProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Equipment Lookup Table")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "EPS Status" })).not.toBeInTheDocument();
    const equipmentCell = screen.getByRole("cell", { name: "IAD06-PDU6-01D-4" });
    const row = equipmentCell.closest("tr");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("0");

    await user.click(equipmentCell);
    expect(screen.getByText("Asset Information")).toBeInTheDocument();
    expect(screen.getByText("IEM")).toBeInTheDocument();
    expect(screen.getByText("PDU54SHAM")).toBeInTheDocument();
    expect(screen.getByText("J02PDU000-00032")).toBeInTheDocument();
  });
});
