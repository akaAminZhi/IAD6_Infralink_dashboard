import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { ErrorState } from "./components/common/ErrorState";
import { LoadingState } from "./components/common/LoadingState";
import { AppLayout } from "./components/layout/AppLayout";
import { IssueAttachmentManifestProvider } from "./contexts/IssueAttachmentManifestContext";
import { NetaReportManifestProvider } from "./contexts/NetaReportManifestContext";
import { useDashboardData } from "./hooks/useDashboardData";
import { DataQualityPage } from "./pages/DataQualityPage";
import { DataOperationsPage } from "./pages/DataOperationsPage";
import { EquipmentPage } from "./pages/EquipmentPage";
import { EpsTestExecutionPage } from "./pages/EpsTestExecutionPage";
import { IssuesPage } from "./pages/IssuesPage";
import { MvEquipmentPage } from "./pages/MvEquipmentPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PdmPage } from "./pages/PdmPage";
import { PowerPlanPage } from "./pages/PowerPlanPage";

const KprPage = lazy(() =>
  import("./pages/KprPage").then((module) => ({ default: module.KprPage })),
);

function App() {
  const dashboardData = useDashboardData();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as
    | { fromKpr?: boolean; fromOverview?: boolean }
    | null;
  const cameFromOverview = Boolean(navigationState?.fromOverview);
  const cameFromKpr = Boolean(navigationState?.fromKpr);
  const isDataOperations = location.pathname === "/data-operations";
  const needsDetailData =
    location.pathname === "/equipment" ||
    location.pathname === "/issues" ||
    location.pathname === "/power-plan" ||
    location.pathname === "/data-quality";
  const {
    detailDataLoaded,
    detailDataLoading,
    error,
    loadDetailData,
    loading,
  } = dashboardData;

  useEffect(() => {
    if (
      needsDetailData &&
      !loading &&
      !error &&
      !detailDataLoaded &&
      !detailDataLoading
    ) {
      void loadDetailData();
    }
  }, [detailDataLoaded, detailDataLoading, error, loadDetailData, loading, needsDetailData]);

  return (
    <IssueAttachmentManifestProvider manifest={dashboardData.issueAttachmentManifest}>
      <NetaReportManifestProvider manifest={dashboardData.netaReportManifest}>
        <AppLayout etlRunMetadata={dashboardData.etlRunMetadata}>
          {!isDataOperations &&
          (dashboardData.loading ||
            (needsDetailData &&
              !dashboardData.detailDataLoaded &&
              !dashboardData.detailDataError)) ? (
            <LoadingState />
          ) : !isDataOperations && dashboardData.error ? (
            <ErrorState message={dashboardData.error} onRetry={dashboardData.reload} />
          ) : !isDataOperations && needsDetailData && dashboardData.detailDataError ? (
            <ErrorState message={dashboardData.detailDataError} onRetry={dashboardData.loadDetailData} />
          ) : (
            <>
              {cameFromOverview && location.pathname !== "/overview" ? (
                <button
                  className="fixed bottom-6 right-6 z-50 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg ring-1 ring-black/10 transition hover:bg-primary/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => navigate("/overview")}
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to Overview
                </button>
              ) : null}
              {cameFromKpr && location.pathname !== "/kpr" ? (
                <button
                  className="fixed bottom-6 right-6 z-50 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg ring-1 ring-black/10 transition hover:bg-primary/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => navigate("/kpr")}
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to KPR
                </button>
              ) : null}
              <Routes>
                <Route element={<Navigate replace to="/overview" />} path="/" />
                <Route element={<OverviewPage data={dashboardData} />} path="/overview" />
                <Route
                  element={
                    <Suspense fallback={<LoadingState />}>
                      <KprPage data={dashboardData} />
                    </Suspense>
                  }
                  path="/kpr"
                />
                <Route element={<PdmPage data={dashboardData} />} path="/pdms" />
                <Route element={<EquipmentPage data={dashboardData} />} path="/equipment" />
                <Route element={<IssuesPage data={dashboardData} />} path="/issues" />
                <Route element={<EpsTestExecutionPage data={dashboardData} />} path="/eps-test-execution" />
                <Route element={<PowerPlanPage data={dashboardData} />} path="/power-plan" />
                <Route element={<MvEquipmentPage data={dashboardData} />} path="/mv-equipment" />
                <Route element={<DataQualityPage data={dashboardData} />} path="/data-quality" />
                <Route
                  element={<DataOperationsPage onDashboardReload={dashboardData.reload} />}
                  path="/data-operations"
                />
                <Route element={<Navigate replace to="/overview" />} path="*" />
              </Routes>
            </>
          )}
        </AppLayout>
      </NetaReportManifestProvider>
    </IssueAttachmentManifestProvider>
  );
}

export default App;
