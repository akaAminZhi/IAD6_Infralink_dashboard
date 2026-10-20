import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboardData } from "../hooks/useDashboardData";
import { fetchJson } from "../utils/dataLoaders";
import { DashboardResourceBoundary, DashboardResourcesProvider } from "./DashboardResourcesContext";

vi.mock("../utils/dataLoaders", async (original) => ({
  ...await original<typeof import("../utils/dataLoaders")>(), fetchJson: vi.fn(),
}));
const fetchMock = vi.mocked(fetchJson);
afterEach(() => vi.resetAllMocks());

function Harness() {
  const data = useDashboardData("/pdms");
  const [open, setOpen] = useState(false);
  return <DashboardResourcesProvider value={data}>
    <button onClick={() => setOpen(true)}>Open details</button>
    <button onClick={data.reload}>ETL reload</button>
    {data.loading ? <p>Loading list</p> : <p>PDM list ready</p>}
    {open && <DashboardResourceBoundary resources={["epsTestItems"]}>
      <p>{data.epsTestItems.length} EPS items</p>
    </DashboardResourceBoundary>}
  </DashboardResourcesProvider>;
}

describe("deferred dashboard sections", () => {
  it("keeps the list usable while details load, then refreshes open details after ETL", async () => {
    let release!: (value: unknown) => void;
    let version = 1;
    fetchMock.mockImplementation((path) => {
      if (path === "/data/eps_test_items.json" && version === 1) {
        return new Promise((resolve) => { release = resolve; });
      }
      return Promise.resolve(path === "/data/eps_test_items.json" ? { records: [{}, {}] } : { records: [] });
    });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText("PDM list ready");
    expect(fetchMock).not.toHaveBeenCalledWith("/data/eps_test_items.json");
    await user.click(screen.getByRole("button", { name: "Open details" }));
    expect(screen.getByText("PDM list ready")).toBeInTheDocument();
    expect(screen.getByText("Loading dashboard data")).toBeInTheDocument();
    expect(screen.queryByText("0 EPS items")).not.toBeInTheDocument();
    await act(async () => release({ records: [{}] }));
    expect(await screen.findByText("1 EPS items")).toBeInTheDocument();
    version = 2;
    await user.click(screen.getByRole("button", { name: "ETL reload" }));
    await waitFor(() => expect(screen.getByText("2 EPS items")).toBeInTheDocument());
  });
});
