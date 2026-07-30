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
    detailDataError: null,
    detailDataLoaded: false,
    detailDataLoading: false,
    loadDetailData: vi.fn(async () => undefined),
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
  it("shows the loading state for dashboard routes", () => {
    useDashboardDataMock.mockReturnValue(dashboardState({ loading: true }));
    renderRoute("/overview");
    expect(screen.getByText("Loading dashboard data")).toBeInTheDocument();
  });

  it("keeps Data Operations accessible while dashboard data is broken", () => {
    useDashboardDataMock.mockReturnValue(
      dashboardState({ loading: true, error: "Dashboard failed" }),
    );
    renderRoute("/data-operations");
    expect(screen.getByText("Data Operations Route")).toBeInTheDocument();
  });

  it("loads detail data before rendering a detail route", async () => {
    const loadDetailData = vi.fn(async () => undefined);
    useDashboardDataMock.mockReturnValue(
      dashboardState({ loadDetailData, detailDataLoaded: false }),
    );
    renderRoute("/equipment");

    expect(screen.getByText("Loading dashboard data")).toBeInTheDocument();
    await waitFor(() => expect(loadDetailData).toHaveBeenCalledTimes(1));
  });

  it("renders a detail route after detail data is ready", () => {
    useDashboardDataMock.mockReturnValue(
      dashboardState({ detailDataLoaded: true }),
    );
    renderRoute("/equipment");
    expect(screen.getByText("Equipment Route")).toBeInTheDocument();
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
});
