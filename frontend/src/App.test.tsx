import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeDashboardData } from "./test/fixtures";
import { useDashboardData } from "./hooks/useDashboardData";
import App from "./App";

vi.mock("./hooks/useDashboardData", () => ({
  useDashboardData: vi.fn(),
}));
vi.mock("./components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./components/dataOperations/OperationsAuth", () => ({
  OperationsAuthGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./pages/OverviewPage", () => ({
  OverviewPage: () => <div>Overview Route</div>,
}));
vi.mock("./pages/KprPage", () => ({
  KprPage: () => <div>KPR Route</div>,
}));
vi.mock("./pages/PdmPage", () => ({
  PdmPage: () => <div>PDM Route</div>,
}));
vi.mock("./pages/EquipmentPage", () => ({
  EquipmentPage: () => <div>Equipment Route</div>,
}));
vi.mock("./pages/IssuesPage", () => ({
  IssuesPage: () => <div>Issues Route</div>,
}));
vi.mock("./pages/EpsTestExecutionPage", () => ({
  EpsTestExecutionPage: () => <div>EPS Route</div>,
}));
vi.mock("./pages/PowerPlanPage", () => ({
  PowerPlanPage: () => <div>Power Plan Route</div>,
}));
vi.mock("./pages/LayoutPlanPage", () => ({
  LayoutPlanPage: () => <div>Layout Route</div>,
}));
vi.mock("./pages/MvEquipmentPage", () => ({
  MvEquipmentPage: () => <div>MV Equipment Route</div>,
}));
vi.mock("./pages/DataQualityPage", () => ({
  DataQualityPage: () => <div>Data Quality Route</div>,
}));
vi.mock("./pages/DataOperationsPage", () => ({
  DataOperationsPage: () => <div>Data Operations Route</div>,
}));

const useDashboardDataMock = vi.mocked(useDashboardData);

function dashboardState(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useDashboardData> {
  return {
    ...makeDashboardData(),
    resourceStatus: {},
    reloadVersion: 0,
    loadResources: vi.fn(async () => undefined),
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useDashboardData>;
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("App routing and loading behavior", () => {
  it("renders the layout route without fetching global equipment detail data", async () => {
    const state = dashboardState();
    useDashboardDataMock.mockReturnValue(state);
    renderRoute("/layout");
    expect(await screen.findByText("Layout Route")).toBeInTheDocument();
    expect(useDashboardDataMock).toHaveBeenCalledWith("/layout", "");
  });
  it("shows the loading state for dashboard routes", () => {
    useDashboardDataMock.mockReturnValue(dashboardState({ loading: true }));
    renderRoute("/overview");
    expect(screen.getByText("Loading dashboard data")).toBeInTheDocument();
  });

  it("keeps Data Operations accessible while dashboard data is broken", async () => {
    useDashboardDataMock.mockReturnValue(
      dashboardState({ loading: true, error: "Dashboard failed" }),
    );
    renderRoute("/data-operations");
    expect(await screen.findByText("Data Operations Route")).toBeInTheDocument();
  });

  it.each([
    ["/pdms", "PDM Route"], ["/equipment", "Equipment Route"],
    ["/power-plan", "Power Plan Route"], ["/mv-equipment", "MV Equipment Route"],
  ])("renders %s after its route-specific data is ready", async (path, label) => {
    useDashboardDataMock.mockReturnValue(dashboardState());
    renderRoute(path);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(useDashboardDataMock).toHaveBeenCalledWith(path, "");
  });

  it("passes KPR drill-down parameters to the route loader", async () => {
    useDashboardDataMock.mockReturnValue(dashboardState());
    renderRoute("/equipment?lifecycleStage=neta");
    expect(await screen.findByText("Equipment Route")).toBeInTheDocument();
    expect(useDashboardDataMock).toHaveBeenCalledWith("/equipment", "?lifecycleStage=neta");
  });

  it("shows a retryable dashboard error", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    useDashboardDataMock.mockReturnValue(
      dashboardState({ error: "Dashboard data could not be loaded.", reload }),
    );
    renderRoute("/overview");

    expect(screen.getByText("Dashboard data could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("offers a direct return to Overview for Overview-driven navigation", async () => {
    const user = userEvent.setup();
    useDashboardDataMock.mockReturnValue(dashboardState());
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/eps-test-execution",
            state: { fromOverview: true },
          },
        ]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("EPS Route")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Overview" }));
    expect(await screen.findByText("Overview Route")).toBeInTheDocument();
  });

  it("does not show the Overview return button for direct navigation", async () => {
    useDashboardDataMock.mockReturnValue(dashboardState());
    renderRoute("/eps-test-execution");

    expect(await screen.findByText("EPS Route")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to Overview" }),
    ).not.toBeInTheDocument();
  });

  it("offers a direct return to KPR for KPR-driven navigation", async () => {
    const user = userEvent.setup();
    useDashboardDataMock.mockReturnValue(dashboardState());
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/eps-test-execution",
            search: "?testItemFilter=Failed",
            state: { fromKpr: true },
          },
        ]}
      >
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Back to KPR" }));
    expect(await screen.findByText("KPR Route")).toBeInTheDocument();
  });
});
