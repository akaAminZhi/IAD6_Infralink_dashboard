import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IssueAttachmentManifestProvider } from "../contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "../contexts/NetaReportManifestContext";
import { makeDashboardData } from "../test/fixtures";
import type { EnrichedPowerPlanEquipment } from "../utils/powerPlanUtils";
import { PowerPlanPage } from "./PowerPlanPage";

const { downloadPowerPlanSelectionXlsxMock } = vi.hoisted(() => ({
  downloadPowerPlanSelectionXlsxMock: vi.fn(
    async (_rows: unknown[]) => undefined,
  ),
}));

vi.mock("../utils/exportPowerPlanSelection", () => ({
  downloadPowerPlanSelectionXlsx: downloadPowerPlanSelectionXlsxMock,
}));

beforeEach(() => {
  downloadPowerPlanSelectionXlsxMock.mockClear();
});

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

  it("keeps export selections across area families", async () => {
    const user = userEvent.setup();
    const firstEquipment = "IAD06-PDU6-01A-1";
    const secondEquipment = "IAD06-PDU6-01D-1";
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "IAD06-PDM-E6-110-01-PRIMARY-CDS",
          equipment: [{ equipment_id: firstEquipment }],
        },
        {
          pdm_name: "IAD06-PDM-E6-210-01-PRIMARY-CDS",
          equipment: [{ equipment_id: secondEquipment }],
        },
      ],
      equipment: [
        { equipment_id: firstEquipment },
        { equipment_id: secondEquipment },
      ],
    });

    render(
      <IssueAttachmentManifestProvider manifest={null}>
        <NetaReportManifestProvider manifest={null}>
          <PowerPlanPage data={data} />
        </NetaReportManifestProvider>
      </IssueAttachmentManifestProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Select for export" }));
    await user.click(
      screen.getByRole("button", {
        name: `${firstEquipment}: No EPS Data; 0 open issues`,
      }),
    );
    await user.selectOptions(screen.getByLabelText("Area family"), "E6-210");
    await user.click(
      screen.getByRole("button", {
        name: `${secondEquipment}: No EPS Data; 0 open issues`,
      }),
    );

    expect(screen.getByText("2 equipment selected across 2 areas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export .xlsx" }));

    expect(downloadPowerPlanSelectionXlsxMock).toHaveBeenCalledTimes(1);
    const selectedRows = downloadPowerPlanSelectionXlsxMock.mock.calls[0]?.[0] as
      | EnrichedPowerPlanEquipment[]
      | undefined;
    expect(selectedRows).toBeDefined();
    expect(selectedRows!.map((row) => row.equipmentId).sort()).toEqual(
      [firstEquipment, secondEquipment].sort(),
    );

    await user.click(
      screen.getByRole("button", { name: "Selecting equipment" }),
    );
    expect(
      screen.queryByText("2 equipment selected across 2 areas"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select for export" }));
    expect(screen.getByText("0 equipment selected across 0 areas")).toBeInTheDocument();
  });
});
