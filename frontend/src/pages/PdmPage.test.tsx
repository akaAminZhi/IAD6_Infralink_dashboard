import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { makeDashboardData } from "../test/fixtures";
import { PdmPage } from "./PdmPage";

describe("PdmPage energisation", () => {
  it("filters recorded offsite and onsite energisation, combines search, and resets", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PdmPage data={makeDashboardData({ pdms: [
          { pdm_name: "PDM-Offsite", energised_offsite: true },
          { pdm_name: "PDM-Both", energised_offsite: true, energised_onsite: true },
          { pdm_name: "PDM-Onsite", energised_offsite: false, energised_onsite: true },
          { pdm_name: "PDM-Unknown" },
        ] })} />
      </MemoryRouter>,
    );
    const table = within(screen.getByRole("table"));
    await user.click(screen.getByRole("button", { name: "Search & Filters" }));
    await user.selectOptions(screen.getByLabelText("Energisation"), "offsite");
    expect(table.getByText("PDM-Offsite")).toBeInTheDocument();
    expect(table.getByText("PDM-Both")).toBeInTheDocument();
    expect(table.queryByText("PDM-Onsite")).not.toBeInTheDocument();
    expect(table.queryByText("PDM-Unknown")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Energisation"), "onsite");
    expect(table.getByText("PDM-Onsite")).toBeInTheDocument();
    expect(table.getByText("PDM-Both")).toBeInTheDocument();
    expect(table.queryByText("PDM-Offsite")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search PDM, equipment ID, or source label"), "PDM-Both");
    expect(table.getByText("PDM-Both")).toBeInTheDocument();
    expect(table.queryByText("PDM-Onsite")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(table.getByText("PDM-Unknown")).toBeInTheDocument();
    expect(table.getByText("PDM-Offsite")).toBeInTheDocument();
    expect(screen.getByLabelText("Energisation")).toHaveValue("");
  });
});
