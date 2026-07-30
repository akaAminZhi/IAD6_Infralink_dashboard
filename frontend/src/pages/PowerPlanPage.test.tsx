import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import { PowerPlanPage } from "./PowerPlanPage";

describe("PowerPlanPage", () => {
  it("opens PDM and equipment summaries with asset information", async () => {
    const user = userEvent.setup();
    const pdmName = "IAD06-PDM-E6-110-01-PRIMARY-CDS";
    const equipmentId = "IAD06-PDU6-01A-1";
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: pdmName,
          equipment: [
            {
              equipment_id: equipmentId,
              source_equipment_label: "PDU6-01A-1",
              neta_complete: true,
              cases: [],
            },
          ],
        },
      ],
      equipment: [
        {
          equipment_id: equipmentId,
          manufacturer: "IEM",
          model: "MODEL-POWER",
          serial_number: "SERIAL-POWER",
          neta_complete: true,
        },
      ],
      epsTestItems: [
        {
          module_equipment: "PDU6-01A-1",
          equipment_name: "PDU6-01A-1-CT",
          item_status: "Passed",
        },
      ],
    });

    render(
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          <PowerPlanPage data={data} />
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: `${pdmName}: 1 equipment`,
      }),
    );
    expect(screen.getByText("PDM Overview")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: `${equipmentId}: Ready; 0 open issues`,
      }),
    );
    expect(screen.getByText("Asset Information")).toBeInTheDocument();
    expect(screen.getByText("IEM")).toBeInTheDocument();
    expect(screen.getByText("MODEL-POWER")).toBeInTheDocument();
    expect(screen.getByText("SERIAL-POWER")).toBeInTheDocument();
  });
});
